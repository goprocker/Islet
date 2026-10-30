const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

// spotify-web.js only needs electron's shell for the login page
require.cache[require.resolve("electron")] = { exports: { shell: {} } };

test("a refresh that finishes after disconnect doesn't reconnect", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "islet-sp-"));
  const realFetch = global.fetch;
  let release;
  global.fetch = async url => {
    if (String(url).includes("/api/token")) {
      await new Promise(r => { release = r; });
      return { ok: true, json: async () => ({ access_token: "new", refresh_token: "rotated", expires_in: 3600 }) };
    }
    return { ok: true, status: 204 };
  };
  try {
    fs.writeFileSync(path.join(dir, "spotify-token.json"), JSON.stringify({ clientId: "c", access: "old", refresh: "r", expires: 0 }));
    const spotify = require("../spotify-web");
    spotify.init(dir);
    const pending = spotify.extras();
    while (!release) await new Promise(r => setImmediate(r));
    spotify.disconnect();
    release();
    await assert.rejects(pending, /disconnected/);
    assert.strictEqual(spotify.connected(), false);
    assert.strictEqual(fs.existsSync(path.join(dir, "spotify-token.json")), false);
  } finally {
    global.fetch = realFetch;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// answers each Spotify call only when the test says so
function deferredSpotify() {
  const calls = [];
  global.fetch = (url, opts) => new Promise(resolve => calls.push({
    url: String(url), method: opts.method,
    reply: body => resolve({ ok: true, status: 200, text: async () => JSON.stringify(body) }),
  }));
  const find = (part, nth = 0) => calls.filter(c => c.url.includes(part))[nth];
  const until = async (part, nth = 0) => {
    for (const end = Date.now() + 2000; !find(part, nth);) {
      if (Date.now() > end) throw new Error(`no request for ${part}`);
      await new Promise(r => setImmediate(r));
    }
    return find(part, nth);
  };
  return { calls, until };
}
function connectedSpotify() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "islet-sp-"));
  fs.writeFileSync(path.join(dir, "spotify-token.json"), JSON.stringify({ clientId: "c", access: "a", refresh: "r", expires: Date.now() + 3600e3 }));
  const spotify = require("../spotify-web");
  spotify.init(dir);
  return { spotify, done: () => { spotify.disconnect(); fs.rmSync(dir, { recursive: true, force: true }); } };
}
const playing = id => ({ item: { id } });
const answer = async (d, nth, id, isLiked) => {
  (await d.until("currently-playing", nth)).reply(playing(id));
  const contains = await d.until(`contains?ids=${id}`);
  const queue = await d.until("/me/player/queue", nth);
  return { contains, queue, isLiked };
};

test("a late answer for the old track can't flip the like of the current one", async () => {
  const realFetch = global.fetch;
  const d = deferredSpotify();
  const { spotify, done } = connectedSpotify();
  try {
    const a = spotify.extras();
    const ra = await answer(d, 0, "A");
    const b = spotify.extras();
    const rb = await answer(d, 1, "B");
    rb.contains.reply([false]); rb.queue.reply({ queue: [] });
    assert.strictEqual((await b).liked, false);
    ra.contains.reply([true]); ra.queue.reply({ queue: [] });
    assert.strictEqual(await a, null); // the old answer is not published
    const like = spotify.toggleLike();
    const sent = await d.until("/me/tracks?ids=");
    assert.strictEqual(sent.method, "PUT");
    assert.ok(sent.url.endsWith("ids=B"));
    sent.reply(null);
    await like;
  } finally { global.fetch = realFetch; done(); }
});
test("answers in the normal order still give the newest track", async () => {
  const realFetch = global.fetch;
  const d = deferredSpotify();
  const { spotify, done } = connectedSpotify();
  try {
    const a = spotify.extras();
    const ra = await answer(d, 0, "A");
    const b = spotify.extras();
    ra.contains.reply([true]); ra.queue.reply({ queue: [] });
    assert.strictEqual(await a, null);
    const rb = await answer(d, 1, "B");
    rb.contains.reply([true]); rb.queue.reply({ queue: [{ name: "Next", artists: [{ name: "X" }] }] });
    assert.deepStrictEqual(await b, { liked: true, next: { title: "Next", artist: "X" } });
    const like = spotify.toggleLike();
    const sent = await d.until("/me/tracks?ids=");
    assert.strictEqual(sent.method, "DELETE");
    assert.ok(sent.url.endsWith("ids=B"));
    sent.reply(null);
    await like;
  } finally { global.fetch = realFetch; done(); }
});
test("a click while the new track is still loading sends nothing", async () => {
  const realFetch = global.fetch;
  const d = deferredSpotify();
  const { spotify, done } = connectedSpotify();
  try {
    const a = spotify.extras();
    const ra = await answer(d, 0, "A");
    ra.contains.reply([true]); ra.queue.reply({ queue: [] });
    await a;
    const b = spotify.extras();
    const rb = await answer(d, 1, "B");
    await spotify.toggleLike();
    assert.strictEqual(d.calls.some(c => c.url.includes("/me/tracks?ids=")), false);
    rb.contains.reply([false]); rb.queue.reply({ queue: [] });
    await b;
  } finally { global.fetch = realFetch; done(); }
});
test("an answer from before a click can't undo it", async () => {
  const realFetch = global.fetch;
  const d = deferredSpotify();
  const { spotify, done } = connectedSpotify();
  try {
    const first = spotify.extras();
    const r1 = await answer(d, 0, "A");
    r1.contains.reply([false]); r1.queue.reply({ queue: [] });
    await first;
    const stale = spotify.extras();
    (await d.until("currently-playing", 1)).reply(playing("A"));
    const staleContains = await d.until("contains?ids=A", 1);
    const staleQueue = await d.until("/me/player/queue", 1);
    const like = spotify.toggleLike();
    (await d.until("/me/tracks?ids=A")).reply(null);
    await like;
    staleContains.reply([false]); staleQueue.reply({ queue: [] });
    assert.strictEqual(await stale, null);
    const unlike = spotify.toggleLike();
    const sent = await d.until("/me/tracks?ids=A", 1);
    assert.strictEqual(sent.method, "DELETE"); // it is liked now
    sent.reply(null);
    await unlike;
  } finally { global.fetch = realFetch; done(); }
});
