const test = require("node:test");
const assert = require("node:assert");
const cp = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const auth = require("../hooks/hook-auth");
const HOOK = path.join(__dirname, "../hooks/islet-hook.js");
const wait = ms => new Promise(r => setTimeout(r, ms));

// runs the real hook as a child process, sent to a test server instead of Islet's own port;
// each chunk reaches its stdin as a separate write
// `answer` may depend on the nonce the hook sent; `proveWith` is the listener's secret
async function runHook(event, chunks, answer = "{}", proveWith = "secret") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "islet-hook-"));
  const redirect = path.join(dir, "redirect.js");
  fs.writeFileSync(path.join(dir, ".islet-hook-token"), "secret");
  fs.writeFileSync(redirect, `
    const http = require("http"), real = http.request;
    http.request = (o, cb) => real({ ...o, port: Number(process.env.ISLET_TEST_PORT) }, cb);
  `);
  let posted = null;
  const server = http.createServer((req, res) => {
    const hello = req.url.match(/nonce=(.+)$/);
    if (hello) return res.end(JSON.stringify({ proof: auth.sign(proveWith, "hello", hello[1]) }));
    const parts = [];
    req.on("data", d => parts.push(d));
    req.on("end", () => { posted = JSON.parse(Buffer.concat(parts).toString("utf8")); res.end(typeof answer === "function" ? answer(posted.nonce) : answer); });
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  try {
    const child = cp.spawn(process.execPath, ["-r", redirect, HOOK, event], { env: { ...process.env, USERPROFILE: dir, HOME: dir, ISLET_TEST_PORT: String(server.address().port) } });
    let stdout = "";
    child.stdout.on("data", d => (stdout += d));
    const exited = new Promise(r => child.on("exit", r));
    for (const c of chunks) { child.stdin.write(c); await wait(100); }
    child.stdin.end();
    await exited;
    return { posted, stdout };
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
// splits a buffer two bytes into each listed character
function splitInside(bytes, ...chars) {
  const cuts = chars.map(c => bytes.indexOf(Buffer.from(c)) + 2).sort((a, b) => a - b);
  return [...cuts, bytes.length].map((end, i) => bytes.subarray(i ? cuts[i - 1] : 0, end));
}

test("prompt, cwd and session survive characters split across stdin chunks", async () => {
  const input = { session_id: "session-😀", cwd: "C:/projekt-🎵", prompt: "Hello 🌍" };
  const { posted } = await runHook("UserPromptSubmit", splitInside(Buffer.from(JSON.stringify(input)), "😀", "🎵", "🌍"));
  assert.strictEqual(posted.session, input.session_id);
  assert.strictEqual(posted.cwd, input.cwd);
  assert.strictEqual(posted.prompt, input.prompt);
});
test("plain ASCII input is unchanged", async () => {
  const { posted } = await runHook("Stop", [JSON.stringify({ session_id: "s1", cwd: "C:/x" })]);
  assert.strictEqual(posted.event, "Stop");
  assert.strictEqual(posted.session, "s1");
  assert.strictEqual(posted.cwd, "C:/x");
});
for (const decision of ["allow", "deny"]) {
  test(`${decision} from the notch still reaches Claude Code`, async () => {
    const { stdout } = await runHook("PermissionRequest", [JSON.stringify({ session_id: "s1", tool_name: "Bash" })], n => JSON.stringify({ decision, proof: auth.sign("secret", decision, n) }));
    assert.strictEqual(JSON.parse(stdout).hookSpecificOutput.decision.behavior, decision);
  });
}
test("no decision prints nothing", async () => {
  const { stdout } = await runHook("PermissionRequest", [JSON.stringify({ session_id: "s1" })], JSON.stringify({ decision: null }));
  assert.strictEqual(stdout, "");
});
test("a signed allow from Islet becomes the hook's decision", async () => {
  const { stdout } = await runHook("PermissionRequest", ["{}"], n => JSON.stringify({ decision: "allow", proof: auth.sign("secret", "allow", n) }));
  assert.strictEqual(JSON.parse(stdout).hookSpecificOutput.decision.behavior, "allow");
});
test("an unsigned or wrongly signed decision is ignored", async () => {
  for (const answer of ['{"decision":"allow"}', n => JSON.stringify({ decision: "allow", proof: auth.sign("other", "allow", n) }), n => JSON.stringify({ decision: "allow", proof: auth.sign("secret", "deny", n) })]) {
    assert.strictEqual((await runHook("PermissionRequest", ["{}"], answer)).stdout, "");
  }
});
test("a listener that can't prove itself receives no session data", async () => {
  const { posted, stdout } = await runHook("PermissionRequest", ['{"session_id":"s1"}'], '{"decision":"allow"}', "other");
  assert.strictEqual(posted, null);
  assert.strictEqual(stdout, "");
});
