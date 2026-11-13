const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const pd = require("../src/phone-drop.js");

const send = (url, opts, body) => new Promise((resolve, reject) => {
  const req = http.request(url, opts, res => { res.resume(); resolve(res.statusCode); });
  req.on("error", reject);
  req.end(body);
});
const signed = (base, rel, method) => {
  const u = new URL(rel, base), nonce = require("crypto").randomBytes(16).toString("hex");
  const headers = { "X-Islet-Nonce": nonce, "X-Islet-Proof": pd.proof(new URL(base).hash.slice(1), nonce, method, u.pathname + u.search) };
  return [u, { method, headers }];
};

test("an upload folder that can't be created fails the upload and the server keeps answering", { skip: !pd.lanAddress() }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pdd-")), dir = path.join(root, "blocked");
  fs.writeFileSync(dir, "a regular file");
  const added = [];
  const url = await pd.start({ dir, shelf: () => [], onFile: f => added.push(f) });
  try {
    assert.strictEqual(await send(...signed(url, "up?name=test.txt", "POST"), "hello"), 500);
    assert.deepStrictEqual(added, []);
    assert.strictEqual(fs.readFileSync(dir, "utf8"), "a regular file");
    assert.strictEqual(await send(...signed(url, "list", "GET")), 200);
  } finally { pd.stop(); }
});
