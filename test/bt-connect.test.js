const test = require("node:test");
const assert = require("node:assert");
const bt = require("../src/bt-connect");

test("bt: lines parse to sorted unique names, junk is null", () => {
  assert.deepStrictEqual(bt.parseLine('["Buds","Mouse","Buds"]'), ["Buds", "Mouse"]);
  assert.deepStrictEqual(bt.parseLine('"Buds"'), ["Buds"]);
  assert.deepStrictEqual(bt.parseLine("[]"), []);
  assert.deepStrictEqual(bt.parseLine("null"), []);
  assert.deepStrictEqual(bt.parseLine('[1," ",null,"X"]'), ["X"]);
  assert.strictEqual(bt.parseLine("WARNING: blah"), null);
});

test("bt: the first list is a baseline, later ones report changes", () => {
  assert.deepStrictEqual(bt.diff(null, ["Buds"]), { connected: [], disconnected: [] });
  assert.deepStrictEqual(bt.diff(["Buds"], ["Mouse"]), { connected: ["Mouse"], disconnected: ["Buds"] });
  assert.deepStrictEqual(bt.diff(["Buds"], ["Buds"]), { connected: [], disconnected: [] });
});

// fake watcher processes: each records its kills; the test decides when it exits
const { EventEmitter } = require("node:events");
function fakes() {
  const kids = [];
  const spawn = () => { const k = new EventEmitter(); k.stdout = new EventEmitter(); k.kills = 0; k.kill = () => { k.kills++; }; kids.push(k); return k; };
  return { kids, spawn };
}

test("bt: a late exit from a stopped watcher neither clears the new one nor starts another (#254)", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { kids, spawn } = fakes();
  bt.start(() => {}, { spawn, retryMs: 10 });      // A
  bt.stop();                                         // A killed, its exit not here yet
  bt.start(() => {}, { spawn, retryMs: 10 });      // B
  kids[0].emit("exit");                              // A's late exit
  t.mock.timers.tick(1000);
  assert.strictEqual(kids.length, 2, "no retry was scheduled for A");
  assert.ok(bt.running(), "B is still the watcher");
  bt.stop();
  assert.deepStrictEqual(kids.map(k => k.kills), [1, 1], "stop kills the live watcher");
  t.mock.timers.tick(100000);
  assert.strictEqual(kids.length, 2);
});

test("bt: repeated restarts keep exactly one watcher, and stop cancels a pending retry (#254)", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { kids, spawn } = fakes();
  for (let i = 0; i < 5; i++) { bt.start(() => {}, { spawn, retryMs: 10 }); bt.stop(); }
  bt.start(() => {}, { spawn, retryMs: 10 });
  for (const k of kids) k.emit("exit");             // every old exit arrives late, then the live one dies
  t.mock.timers.tick(10);
  assert.strictEqual(kids.length, 7, "only the live run retries, once");
  kids[6].emit("exit");                              // the retry dies too: next retry pending
  bt.stop();
  t.mock.timers.tick(100000);
  assert.strictEqual(kids.length, 7, "stop cancelled the pending retry");
  assert.strictEqual(bt.running(), false);
});

test("bt: output from a stopped watcher publishes nothing (#254)", () => {
  const { kids, spawn } = fakes(); const events = [];
  bt.start(e => events.push(e), { spawn });
  kids[0].stdout.emit("data", Buffer.from("[]\n"));
  bt.stop();
  kids[0].stdout.emit("data", Buffer.from('["Buds"]\n'));
  bt.start(e => events.push(e), { spawn });
  kids[0].stdout.emit("data", Buffer.from('["Mouse"]\n'));
  assert.deepStrictEqual(events, []);
  bt.stop();
});

test("bt: a failed spawn retries; error plus exit retries only once (#254)", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { kids, spawn } = fakes();
  bt.start(() => {}, { spawn, retryMs: 10 });
  kids[0].emit("error", new Error("ENOENT"));       // no exit at all
  t.mock.timers.tick(10);
  assert.strictEqual(kids.length, 2, "error alone retries");
  kids[1].emit("error", new Error("boom")); kids[1].emit("exit");
  t.mock.timers.tick(20);
  assert.strictEqual(kids.length, 3, "error and exit together retry once");
  t.mock.timers.tick(100000);
  assert.strictEqual(kids.length, 3);
  bt.stop();
});
