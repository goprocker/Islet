const test = require("node:test");
const assert = require("node:assert");
const { EventEmitter } = require("events");
const { helperLifecycle } = require("../src/helper-lifecycle");

// counts the helpers started and stopped, with the retry timer run by hand
function setup() {
  const started = [];
  const realSet = global.setTimeout, realClear = global.clearTimeout;
  const timers = new Map();
  let next = 1;
  global.setTimeout = fn => { timers.set(next, fn); return next++; };
  global.clearTimeout = id => timers.delete(id);
  const life = helperLifecycle(() => {
    const c = new EventEmitter();
    c.killed = false;
    c.kill = () => { c.killed = true; };
    started.push(c);
    return c;
  });
  const running = () => started.filter(c => !c.killed && !c.exited);
  const exit = c => { c.exited = true; c.emit("exit"); };
  const runTimers = () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } };
  return { life, started, running, exit, runTimers, timers, done() { global.setTimeout = realSet; global.clearTimeout = realClear; } };
}
const check = fn => () => { const t = setup(); try { fn(t); } finally { t.done(); } };

test("locking stops the helper and unlocking starts one again", check(({ life, started, running }) => {
  life.start();
  life.pause("locked");
  assert.strictEqual(running().length, 0);
  life.resume("locked");
  assert.strictEqual(running().length, 1);
  assert.strictEqual(started.length, 2);
}));

test("lock then sleep needs both to end before restarting", check(({ life, running }) => {
  life.start();
  life.pause("locked");
  life.pause("asleep");
  life.resume("asleep"); // resumed but still locked
  assert.strictEqual(running().length, 0);
  life.resume("locked");
  assert.strictEqual(running().length, 1);
}));

test("repeated events start only one helper", check(({ life, started, running }) => {
  life.start();
  life.pause("locked"); life.pause("locked");
  life.resume("locked"); life.resume("locked");
  life.resume("asleep");
  assert.strictEqual(running().length, 1);
  assert.strictEqual(started.length, 2);
}));

test("the stopped helper's late exit doesn't start another", check(({ life, started, exit, timers, running }) => {
  life.start();
  life.pause("locked");
  exit(started[0]);
  assert.strictEqual(timers.size, 0);
  life.resume("locked");
  exit(started[0]);
  assert.strictEqual(timers.size, 0);
  assert.strictEqual(running().length, 1);
}));

test("a pause cancels a restart that was waiting", check(({ life, started, exit, runTimers, running }) => {
  life.start();
  exit(started[0]);
  life.pause("locked");
  runTimers();
  assert.strictEqual(running().length, 0);
  life.resume("locked");
  assert.strictEqual(running().length, 1);
}));

test("a crash while running restarts after the wait", check(({ life, started, exit, runTimers, running }) => {
  life.start();
  exit(started[0]);
  assert.strictEqual(running().length, 0);
  runTimers();
  assert.strictEqual(running().length, 1);
}));

test("nothing restarts after quitting", check(({ life, started, exit, timers, running }) => {
  life.start();
  life.quit();
  exit(started[0]);
  life.resume("locked");
  assert.strictEqual(timers.size, 0);
  assert.strictEqual(running().length, 0);
}));

test("a helper that fails to launch retries once, without throwing", check(({ life, started, timers, runTimers }) => {
  life.start();
  started[0].exited = true;
  started[0].emit("error", new Error("spawn ENOENT"));
  started[0].emit("exit");
  assert.strictEqual(timers.size, 1);
  runTimers();
  assert.strictEqual(started.length, 2);
}));

test("quitting after a failed launch cancels the retry", check(({ life, started, timers }) => {
  life.start();
  started[0].emit("error", new Error("spawn ENOENT"));
  life.quit();
  assert.strictEqual(timers.size, 0);
}));
