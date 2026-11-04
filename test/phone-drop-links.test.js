const test = require("node:test");
const assert = require("node:assert");
const http = require("http");
const fs = require("fs");
const os = require("os");
const net = require("net");
const pd = require("../phone-drop.js");

const lan = pd.lanAddress();
const get = u => new Promise(r => http.get(u, x => { let s = ""; x.on("data", c => s += c).on("end", () => r([x.statusCode, s])); }));

test("a rendered link never serves a different file after the shelf changes", { skip: !lan }, async () => {
  const d = fs.mkdtempSync(os.tmpdir() + "/pd");
  fs.writeFileSync(d + "/a.txt", "A"); fs.writeFileSync(d + "/b.txt", "B");
  let shelf = [{ name: "a.txt", path: d + "/a.txt" }, { name: "b.txt", path: d + "/b.txt" }];
  const url = await pd.start({ dir: d + "/up", shelf: () => shelf, onFile() {} });
  try {
    const link = (await get(url))[1].match(/href="(f\/[^"]+)"/)[1];
    assert.deepStrictEqual(await get(url + link), [200, "A"]);
    shelf = [shelf[1]];
    assert.strictEqual((await get(url + link))[0], 404);
  } finally { pd.stop(); }
});

test("an aborted upload leaves no partial file", { skip: !lan }, async () => {
  const d = fs.mkdtempSync(os.tmpdir() + "/pd");
  let calls = 0;
  const url = await pd.start({ dir: d, shelf: () => [], onFile() { calls++; } });
  try {
    const u = new URL(url);
    const s = net.connect(u.port, u.hostname, () => {
      s.write(`POST ${u.pathname}up?name=x.txt HTTP/1.1\r\nHost:x\r\nContent-Length: 100\r\n\r\nPARTIAL`);
      setTimeout(() => s.destroy(), 100);
    });
    await new Promise(r => setTimeout(r, 400));
    assert.deepStrictEqual(fs.readdirSync(d), []);
    assert.strictEqual(calls, 0);
  } finally { pd.stop(); }
});
