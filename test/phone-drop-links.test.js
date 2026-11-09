const test = require("node:test");
const assert = require("node:assert");
const http = require("http");
const fs = require("fs");
const os = require("os");
const net = require("net");
const vm = require("vm");
const pd = require("../src/phone-drop.js");

const lan = pd.lanAddress();
const plain = u => new Promise(r => http.get(u, x => { let s = ""; x.on("data", c => s += c).on("end", () => r([x.statusCode, s])); }));
let nonceSeq = 0;
function signed(url, rel, nonce = (++nonceSeq).toString(16).padStart(32, "0")) {
  const base = new URL(url), key = base.hash.slice(1), u = new URL(rel, base);
  const target = u.pathname + u.search;
  const headers = { "X-Islet-Nonce": nonce, "X-Islet-Proof": pd.proof(key, nonce, "GET", target) };
  return { nonce, get: () => new Promise((resolve, reject) => {
    const req = http.get(u, { headers }, x => { let s = ""; x.on("data", c => s += c).on("end", () => resolve([x.statusCode, s])); });
    req.on("error", reject);
  }) };
}
function uploadHead(url, name, length) {
  const base = new URL(url), key = base.hash.slice(1), u = new URL(`up?name=${encodeURIComponent(name)}`, base);
  const nonce = (++nonceSeq).toString(16).padStart(32, "0"), target = u.pathname + u.search;
  return { u, headers: `X-Islet-Nonce: ${nonce}\r\nX-Islet-Proof: ${pd.proof(key, nonce, "POST", target)}\r\n`, target };
}

test("the reusable secret stays in the QR fragment and API traffic is authenticated", { skip: !lan }, async () => {
  const d = fs.mkdtempSync(os.tmpdir() + "/pd");
  fs.writeFileSync(d + "/secret.txt", "secret");
  const url = await pd.start({ dir: d + "/up", shelf: () => [{ name: "secret.txt", path: d + "/secret.txt" }], onFile() {} });
  try {
    const u = new URL(url), [code, html] = await plain(url);
    assert.strictEqual(code, 200);
    assert.ok(/^[0-9a-f]{64}$/.test(u.hash.slice(1)));
    assert.ok(!u.pathname.includes(u.hash.slice(1)));
    assert.ok(!html.includes("secret.txt"));
    const script = html.match(/<script>([\s\S]+)<\/script>/)[1];
    const element = {};
    const context = { location: { hash: u.hash, pathname: u.pathname, href: url }, history: { replaceState() {} }, TextEncoder, URL, Uint8Array, Uint32Array, DataView, crypto: { getRandomValues: b => b.fill(1) }, fetch: async () => ({ ok: false }), document: { getElementById: () => element }, setTimeout };
    vm.runInNewContext(`${script};globalThis.browserHmac=(key,message)=>hx(hmac(bytes(key),enc.encode(message)))`, context);
    assert.strictEqual(context.browserHmac("11".repeat(32), "\n\nrequest"), pd.proof("11".repeat(32), "", "", "request"));
    assert.strictEqual((await plain(new URL("list", u)))[0], 401);
    assert.strictEqual((await signed(url, "list").get())[0], 200);
  } finally { pd.stop(); }
});

test("a captured proof cannot be replayed", { skip: !lan }, async () => {
  const d = fs.mkdtempSync(os.tmpdir() + "/pd");
  const url = await pd.start({ dir: d, shelf: () => [], onFile() {} });
  try {
    const request = signed(url, "list");
    assert.strictEqual((await request.get())[0], 200);
    assert.strictEqual((await request.get())[0], 401);
  } finally { pd.stop(); }
});

test("a rendered file id never serves a different file after the shelf changes", { skip: !lan }, async () => {
  const d = fs.mkdtempSync(os.tmpdir() + "/pd");
  fs.writeFileSync(d + "/a.txt", "A"); fs.writeFileSync(d + "/b.txt", "B");
  let shelf = [{ name: "a.txt", path: d + "/a.txt" }, { name: "b.txt", path: d + "/b.txt" }];
  const url = await pd.start({ dir: d + "/up", shelf: () => shelf, onFile() {} });
  try {
    const files = JSON.parse((await signed(url, "list").get())[1]);
    assert.deepStrictEqual(await signed(url, `f/${files[0].id}`).get(), [200, "A"]);
    shelf = [shelf[1]];
    assert.strictEqual((await signed(url, `f/${files[0].id}`).get())[0], 404);
  } finally { pd.stop(); }
});

test("an aborted authenticated upload leaves no partial file", { skip: !lan }, async () => {
  const d = fs.mkdtempSync(os.tmpdir() + "/pd");
  let calls = 0;
  const url = await pd.start({ dir: d, shelf: () => [], onFile() { calls++; } });
  try {
    const { u, headers, target } = uploadHead(url, "x.txt", 100);
    const s = net.connect(u.port, u.hostname, () => {
      s.write(`POST ${target} HTTP/1.1\r\nHost:x\r\n${headers}Content-Length: 100\r\n\r\nPARTIAL`);
      setTimeout(() => s.destroy(), 100);
    });
    await new Promise(r => setTimeout(r, 400));
    assert.deepStrictEqual(fs.readdirSync(d), []);
    assert.strictEqual(calls, 0);
  } finally { pd.stop(); }
});

test("stopping Phone drop closes an active transfer", { skip: !lan }, async () => {
  const d = fs.mkdtempSync(os.tmpdir() + "/pd");
  const url = await pd.start({ dir: d, shelf: () => [], onFile() {} });
  const { u, headers, target } = uploadHead(url, "x.txt", 100000);
  const closed = new Promise((resolve, reject) => {
    const s = net.connect(u.port, u.hostname, () => {
      s.write(`POST ${target} HTTP/1.1\r\nHost:x\r\n${headers}Content-Length: 100000\r\n\r\nPARTIAL`);
      pd.stop();
    });
    s.on("close", resolve); s.on("error", e => e.code === "ECONNRESET" ? resolve() : reject(e));
  });
  await closed; await new Promise(r => setTimeout(r, 50));
  assert.deepStrictEqual(fs.readdirSync(d), []);
});

test("an expired session stops accepting requests", { skip: !lan }, async () => {
  const d = fs.mkdtempSync(os.tmpdir() + "/pd");
  const url = await pd.start({ dir: d, shelf: () => [], onFile() {}, lifetime: 20 });
  await new Promise(r => setTimeout(r, 60));
  await assert.rejects(() => signed(url, "list").get());
});
