const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "../renderer/notch.js"), "utf8");
const between = (a, b) => { const s = source.indexOf(a); return source.slice(s, source.indexOf(b, s)); };
const piece = between("window.bridge.onToggle(", "// open briefly") + between("// ---- toasts", '$("notch").querySelector(".toastv")');

// the real toast queue and hotkey handler, with a controlled clock
function setup() {
  const classes = new Set();
  const timers = new Map();
  let nextTimer = 1, toggle;
  const el = () => ({ style: { setProperty() {} }, replaceChildren() {}, textContent: "", scrollHeight: 40 });
  const elements = {};
  const context = {
    notch: {
      classList: {
        contains: c => classes.has(c), add: c => classes.add(c), remove: c => classes.delete(c),
      },
      style: { setProperty() {} }, querySelector: () => el(),
    },
    $: id => (elements[id] ||= el()),
    document: { createElement: () => ({}) },
    window: { bridge: { onToggle: fn => { toggle = fn; } }, BlackHole: { cancel() {} } },
    setOpen: o => { if (o) classes.add("open"); else classes.delete("open"); },
    hovering: false,
    setTimeout: (fn) => { const id = nextTimer++; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id),
  };
  vm.runInNewContext(`${piece}
    globalThis.api = { toast, get queue() { return toasts.map(t => t.title); }, get busy() { return toastBusy; }, get current() { return current?.title; } };`, context);
  // run whatever is scheduled until the queue has nothing left to do
  const runTimers = () => { while (timers.size) { const [id, fn] = timers.entries().next().value; timers.delete(id); fn(); } };
  const runOne = () => { const [id, fn] = timers.entries().next().value; timers.delete(id); fn(); };
  const seen = [];
  const watch = () => { if (context.api.current && seen.at(-1) !== context.api.current) seen.push(context.api.current); };
  const drain = () => { watch(); while (timers.size) { runOne(); watch(); } };
  return { api: context.api, classes, toggle: () => toggle(), runTimers, runOne, drain, seen, timers };
}
const hide = s => { s.classes.add("hidden"); };

test("without hiding, pop-ups show one after another", () => {
  const s = setup();
  for (const title of ["A", "B", "C"]) s.api.toast({ title });
  s.drain();
  assert.deepStrictEqual(s.seen, ["A", "B", "C"]);
  assert.strictEqual(s.api.busy, false);
});
test("hiding during a pop-up keeps the rest, and showing resumes them in order", () => {
  const s = setup();
  for (const title of ["A", "B", "C"]) s.api.toast({ title });
  hide(s);
  s.drain(); // A times out while hidden
  assert.deepStrictEqual([...s.api.queue], ["B", "C"]);
  assert.strictEqual(s.api.busy, false);
  assert.strictEqual(s.classes.has("toast"), false);
  s.toggle();
  assert.strictEqual(s.classes.has("hidden"), false);
  s.drain();
  assert.deepStrictEqual(s.seen, ["A", "B", "C"]);
  assert.deepStrictEqual([...s.api.queue], []);
});
test("pop-ups that arrive while hidden wait, and show without another one arriving", () => {
  const s = setup();
  hide(s);
  s.api.toast({ title: "A" });
  s.api.toast({ title: "B" });
  s.drain();
  assert.deepStrictEqual(s.seen, []);
  assert.deepStrictEqual([...s.api.queue], ["A", "B"]);
  s.toggle();
  s.drain();
  assert.deepStrictEqual(s.seen, ["A", "B"]);
});
test("a long time hidden keeps only the latest few", () => {
  const s = setup();
  hide(s);
  for (let i = 1; i <= 8; i++) s.api.toast({ title: `T${i}` });
  assert.deepStrictEqual([...s.api.queue], ["T4", "T5", "T6", "T7", "T8"]);
});
test("showing again with nothing queued does nothing", () => {
  const s = setup();
  hide(s);
  s.toggle();
  assert.strictEqual(s.api.busy, false);
  assert.strictEqual(s.classes.has("toast"), false);
  assert.strictEqual(s.timers.size, 0);
});
test("showing again while a pop-up is still up doesn't start a second one", () => {
  const s = setup();
  s.api.toast({ title: "A" });
  s.api.toast({ title: "B" });
  hide(s);
  s.toggle();
  assert.strictEqual(s.api.current, "A");
  assert.deepStrictEqual([...s.api.queue], ["B"]);
  s.drain();
  assert.deepStrictEqual(s.seen, ["A", "B"]);
});
