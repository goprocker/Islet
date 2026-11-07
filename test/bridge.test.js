const test = require("node:test");
const assert = require("node:assert");
const http = require("http");
const { EventEmitter } = require("events");
const fs = require("fs");
const os = require("os");
const path = require("path");
const auth = require("../hooks/hook-auth");

// a throwaway profile, so the tests never touch the real hook secret
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "islet-bridge-"));
process.env.USERPROFILE = process.env.HOME = profile;
test.after(() => fs.rmSync(profile, { recursive: true, force: true }));

// capture the bridge's request handler instead of opening a real port
function startBridge(options = {}) {
  const realCreate = http.createServer;
  let handler;
  http.createServer = h => { handler = h; return Object.assign(new EventEmitter(), { listen() {} }); };
  delete require.cache[require.resolve("../src/claude-bridge")];
  const bridge = require("../src/claude-bridge");
  const seen = [], permissions = [], gone = [];
  try { bridge.start({
    onStatus: (s, st) => seen.push([s, st]),
    onPermission: p => permissions.push(p),
    onPermissionGone: id => gone.push(id),
    permissionWait: options.permissionWait,
  }); }
  finally { http.createServer = realCreate; }
  return { bridge, seen, permissions, gone, post: (body, proof) => send(handler, body, proof).code, request: (body, proof) => send(handler, body, proof) };
}
function send(handler, body, proof) {
  const text = Buffer.concat([].concat(body).map(b => Buffer.from(b))).toString("utf8");
  const headers = { "x-islet-proof": proof === undefined ? auth.sign(auth.ensureToken(), "event", text) : proof };
  const req = Object.assign(new EventEmitter(), { method: "POST", url: "/claude", headers, destroy() {} });
  const res = Object.assign(new EventEmitter(), {
    code: 0, writableEnded: false,
    writeHead(c) { this.code = c; return this; },
    end() { this.writableEnded = true; return this; },
  });
  handler(req, res);
  for (const chunk of [].concat(body)) req.emit("data", chunk);
  req.emit("end");
  return res;
}

for (const body of ["null", "[]", "42", '"x"', "{}", '{"event":"Stop"}', '{"event":"Stop","session":5}', '{"event":"Stop","session":"s","tool":{}}', '{"event":"Stop","session":"s","agent":"other"}', '{"event":"Stop","session":"s","toolInput":[1]}']) {
  test(`rejects ${body} with 400 and changes nothing`, () => {
    const { bridge, seen, post } = startBridge();
    assert.strictEqual(post(body), 400);
    assert.deepStrictEqual(seen, []);
    assert.strictEqual(bridge.status.size, 0);
  });
}

const STOP = '{"event":"Stop","session":"s1"}';
for (const [name, proof] of [["no", null], ["a wrong", "0".repeat(64)], ["another body's", auth.sign("wrong secret", "event", STOP)]]) {
  test(`an event with ${name} proof gets 401 and changes nothing`, () => {
    const { bridge, seen, post } = startBridge();
    assert.strictEqual(post(STOP, proof), 401);
    assert.deepStrictEqual(seen, []);
    assert.strictEqual(bridge.status.size, 0);
  });
}

test("accepts a normal hook event", () => {
  const { bridge, seen, post } = startBridge();
  assert.strictEqual(post('{"event":"Stop","session":"s1","cwd":"C:/x","toolInput":null}'), 200);
  assert.deepStrictEqual(seen, [["s1", "done"]]);
  assert.strictEqual(bridge.status.get("s1").status, "done");
});

test("Codex permission requests can be answered from Islet", () => {
  const { bridge, seen, permissions, gone, request } = startBridge({ permissionWait: () => 1000 });
  const res = request(JSON.stringify({ event: "PermissionRequest", agent: "codex", session: "cx1", cwd: "C:/work/app", nonce: "a".repeat(32), tool: "Bash", toolInput: { command: "npm test" } }));
  assert.strictEqual(res.code, 0, "the hook response stays open while the notch asks");
  assert.deepStrictEqual(seen, [["cx1", "waiting"]]);
  assert.strictEqual(permissions.length, 1);
  assert.strictEqual(permissions[0].detail, "npm test");
  bridge.answer(permissions[0].id, "allow", id => gone.push(id));
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.writableEnded, true);
  assert.deepStrictEqual(gone, [permissions[0].id]);
  assert.strictEqual(bridge.status.get("cx1").status, "working");
});

test("a character split across two chunks stays whole", () => {
  const { seen, post } = startBridge();
  const bytes = Buffer.from(JSON.stringify({ event: "Stop", session: "session-😀", cwd: "C:/projekt-ü" }));
  const at = bytes.indexOf(Buffer.from("😀")) + 2;
  assert.strictEqual(post([bytes.subarray(0, at), bytes.subarray(at)]), 200);
  assert.deepStrictEqual(seen, [["session-😀", "done"]]);
});
test("every byte in its own chunk still decodes", () => {
  const { seen, post } = startBridge();
  const bytes = Buffer.from(JSON.stringify({ event: "Stop", session: "日本語-😀" }));
  assert.strictEqual(post([...bytes].map(b => Buffer.from([b]))), 200);
  assert.deepStrictEqual(seen, [["日本語-😀", "done"]]);
});
test("the 1 MB limit counts bytes, not characters", () => {
  const realCreate = http.createServer;
  let handler;
  http.createServer = h => { handler = h; return Object.assign(new EventEmitter(), { listen() {} }); };
  delete require.cache[require.resolve("../src/claude-bridge")];
  try { require("../src/claude-bridge").start({ onStatus() {}, onPermission() {}, onPermissionGone() {} }); }
  finally { http.createServer = realCreate; }
  const body = Buffer.from("😀".repeat(300000)); // 1.2 MB, but only 600,000 UTF-16 units
  let destroyed = false;
  const req = Object.assign(new EventEmitter(), { method: "POST", url: "/claude", destroy() { destroyed = true; } });
  handler(req, new EventEmitter());
  req.emit("data", body);
  assert.strictEqual(destroyed, true);
});

test("a permission card shows the real command, not just its description", () => {
  const { summarize } = require("../src/claude-bridge");
  const detail = summarize("Bash", { command: "echo actual-command", description: "Read project files" });
  assert.strictEqual(detail, "echo actual-command\n(Read project files)");
  assert.strictEqual(summarize("Bash", { command: "ls" }), "ls");
});
test("a long command is kept well past the old 140 characters", () => {
  const { summarize } = require("../src/claude-bridge");
  const tail = "x".repeat(1000) + "rm -rf build";
  assert.ok(summarize("Bash", { command: tail }).endsWith("rm -rf build"));
});
