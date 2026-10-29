const test = require("node:test");
const assert = require("node:assert");
const http = require("http");
const { EventEmitter } = require("events");

// capture the bridge's request handler instead of opening a real port
function startBridge() {
  const realCreate = http.createServer;
  let handler;
  http.createServer = h => { handler = h; return Object.assign(new EventEmitter(), { listen() {} }); };
  delete require.cache[require.resolve("../claude-bridge")];
  const bridge = require("../claude-bridge");
  const seen = [];
  try { bridge.start({ onStatus: (s, st) => seen.push([s, st]), onPermission() {}, onPermissionGone() {} }); }
  finally { http.createServer = realCreate; }
  return { bridge, seen, post: body => send(handler, body) };
}
function send(handler, body) {
  const req = Object.assign(new EventEmitter(), { method: "POST", url: "/claude", destroy() {} });
  const res = Object.assign(new EventEmitter(), {
    code: 0, writableEnded: false,
    writeHead(c) { this.code = c; return this; },
    end() { this.writableEnded = true; return this; },
  });
  handler(req, res);
  req.emit("data", body);
  req.emit("end");
  return res.code;
}

for (const body of ["null", "[]", "42", '"x"', "{}", '{"event":"Stop"}', '{"event":"Stop","session":5}', '{"event":"Stop","session":"s","tool":{}}', '{"event":"Stop","session":"s","agent":"other"}', '{"event":"Stop","session":"s","toolInput":[1]}']) {
  test(`rejects ${body} with 400 and changes nothing`, () => {
    const { bridge, seen, post } = startBridge();
    assert.strictEqual(post(body), 400);
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
