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
