const test = require("node:test");
const assert = require("node:assert");
const { follower } = require("../lyrics");

const SONG = { title: "Song", artist: "Artist", duration: 120 };
const LINES = [{ t: 10, line: "One" }];
const tick = () => new Promise(r => setImmediate(r));
// a lyrics lookup that answers when the test says so
function setup() {
  const asks = [], got = [];
  const f = follower(l => got.push(l), (title, artist, duration) => new Promise(resolve => asks.push({ title, artist, duration, resolve })));
  return { f, asks, got };
}

test("fresh load: cleared, then the song's lines", async () => {
  const { f, asks, got } = setup();
  f.update(SONG);
  assert.deepStrictEqual(asks.map(a => [a.title, a.artist, a.duration]), [["Song", "Artist", 120]]);
  asks[0].resolve(LINES);
  await tick();
  assert.deepStrictEqual(got, [null, LINES]);
});
test("the same song again asks nothing and sends nothing", async () => {
  const { f, asks, got } = setup();
  f.update(SONG);
  asks[0].resolve(LINES);
  await tick();
  got.length = 0;
  f.update(SONG);
  await tick();
  assert.strictEqual(asks.length, 1);
  assert.deepStrictEqual(got, []);
});
test("a reloaded page gets the current lines without a new lookup", async () => {
  const { f, asks, got } = setup();
  f.update(SONG);
  asks[0].resolve(LINES);
  await tick();
  got.length = 0;
  f.resend();
  f.update(SONG);
  await tick();
  assert.strictEqual(asks.length, 1);
  assert.deepStrictEqual(got, [LINES]);
});
test("lyrics turned off: a reloaded page stays empty", async () => {
  const { f, asks, got } = setup();
  f.update(SONG);
  asks[0].resolve(LINES);
  await tick();
  f.update(null);
  got.length = 0;
  f.resend();
  assert.deepStrictEqual(got, [null]);
});
test("reload during the lookup: the answer still arrives, once", async () => {
  const { f, asks, got } = setup();
  f.update(SONG);
  got.length = 0;
  f.resend(); // nothing to show yet
  asks[0].resolve(LINES);
  await tick();
  assert.deepStrictEqual(got, [null, LINES]);
});
test("an answer for a song that has moved on is dropped, also after a reload", async () => {
  const { f, asks, got } = setup();
  f.update(SONG);
  f.update({ title: "Other", artist: "B", duration: 90 });
  asks[0].resolve(LINES);
  await tick();
  assert.deepStrictEqual(got, [null, null]);
  got.length = 0;
  f.resend();
  assert.deepStrictEqual(got, [null]);
});
test("lyrics turned off during the lookup: the answer is dropped", async () => {
  const { f, asks, got } = setup();
  f.update(SONG);
  f.update(null);
  asks[0].resolve(LINES);
  await tick();
  assert.deepStrictEqual(got, [null, null]);
});
