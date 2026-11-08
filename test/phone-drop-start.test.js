const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const pd = require("../src/phone-drop.js");

const lan = pd.lanAddress();
const opts = () => ({ dir: fs.mkdtempSync(os.tmpdir() + "/pds") + "/up", shelf: () => [], onFile() {} });

test("concurrent start calls share one startup and resolve to the same URL", { skip: !lan }, async () => {
  try {
    const [a, b, c] = await Promise.all([pd.start(opts()), pd.start(opts()), pd.start(opts())]);
    assert.match(a, /^http:\/\/.+:\d+\/[0-9a-f]{32}\/$/);
    assert.strictEqual(b, a);
    assert.strictEqual(c, a);
    assert.strictEqual(await pd.start(opts()), a, "a later call reuses the running session");
  } finally { pd.stop(); }
});

test("stop before the server finishes binding rejects instead of publishing a URL", { skip: !lan }, async () => {
  const pending = pd.start(opts());
  pd.stop();
  await assert.rejects(pending, /stopped/);
  try {
    assert.match(await pd.start(opts()), /^http:\/\//, "a fresh session starts normally afterwards");
  } finally { pd.stop(); }
});
