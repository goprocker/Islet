const test = require("node:test");
const assert = require("node:assert");
const cp = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const auth = require("../hooks/hook-auth");
const HOOK = path.join(__dirname, "../hooks/islet-hook.js");

// runs the real hook against a chosen port, with a throwaway profile folder holding its secret
async function runHook(port) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "islet-hook-"));
  const redirect = path.join(dir, "redirect.js");
  fs.writeFileSync(path.join(dir, ".islet-hook-token"), "secret");
  fs.writeFileSync(redirect, `
    const http = require("http"), real = http.request;
    http.request = (o, cb) => real({ ...o, port: ${port} }, cb);
  `);
  try {
    const child = cp.spawn(process.execPath, ["-r", redirect, HOOK, "PermissionRequest"], { env: { ...process.env, USERPROFILE: dir, HOME: dir } });
    let stdout = "";
    child.stdout.on("data", d => (stdout += d));
    const exited = new Promise(r => child.on("exit", r));
    child.stdin.end('{"session_id":"s1","tool_name":"Bash"}');
    return { code: await exited, stdout };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const listen = handler => new Promise(r => { const s = http.createServer(handler).listen(0, "127.0.0.1", () => r(s)); });

test("nothing listening: the hook stays neutral", async () => {
  const s = await listen(() => {});
  const { port } = s.address();
  await new Promise(r => s.close(r));
  assert.deepStrictEqual(await runHook(port), { code: 0, stdout: "" });
});

test("a listener that never answers: the hook stays neutral", async () => {
  const s = await listen(() => {});
  try {
    assert.deepStrictEqual(await runHook(s.address().port), { code: 0, stdout: "" });
  } finally { s.closeAllConnections(); s.close(); }
});

test("a listener replaying a proof for another nonce gets no data and no decision", async () => {
  let posted = false;
  const s = await listen((req, res) => {
    if (req.method === "POST") posted = true;
    res.end(JSON.stringify({ proof: auth.sign("secret", "hello", "0".repeat(32)), decision: "allow" }));
  });
  try {
    assert.deepStrictEqual(await runHook(s.address().port), { code: 0, stdout: "" });
    assert.strictEqual(posted, false);
  } finally { s.close(); }
});

test("a decision signed for another nonce is ignored", async () => {
  const s = await listen((req, res) => {
    const hello = req.url.match(/nonce=(.+)$/);
    if (hello) return res.end(JSON.stringify({ proof: auth.sign("secret", "hello", hello[1]) }));
    req.resume();
    req.on("end", () => res.end(JSON.stringify({ decision: "allow", proof: auth.sign("secret", "allow", "0".repeat(32)) })));
  });
  try {
    assert.deepStrictEqual(await runHook(s.address().port), { code: 0, stdout: "" });
  } finally { s.close(); }
});
