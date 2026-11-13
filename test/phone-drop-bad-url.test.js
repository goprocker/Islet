const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const http = require("http");
const pd = require("../src/phone-drop.js");

const send = (url, opts = {}) => new Promise((resolve, reject) => {
  const req = http.request(url, opts, res => { res.resume(); resolve(res.statusCode); });
  req.on("error", reject);
  req.end();
});

test("a malformed request URL gets 400 and the server keeps answering", { skip: !pd.lanAddress() }, async () => {
  const url = await pd.start({ dir: fs.mkdtempSync(os.tmpdir() + "/pdu"), shelf: () => [], onFile() {} });
  try {
    assert.strictEqual(await send(url, { path: "http://[" }), 400);
    const u = new URL("list", url), nonce = "a".repeat(32);
    const proof = pd.proof(new URL(url).hash.slice(1), nonce, "GET", u.pathname + u.search);
    assert.strictEqual(await send(u, { headers: { "X-Islet-Nonce": nonce, "X-Islet-Proof": proof } }), 200);
  } finally { pd.stop(); }
});
