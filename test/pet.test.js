const test = require("node:test");
const assert = require("node:assert");
const { pick, paint, MOODS } = require("../renderer/pet");

const base = { now: 1_000_000, battery: null, toastAt: 0, timerEnd: 0, timerLabel: "", playing: false, quietSince: 0 };

test("a calm notch gives an idle cat", () => assert.strictEqual(pick(base), "idle"));

test("music makes it dance", () => assert.strictEqual(pick({ ...base, playing: true }), "dance"));

test("it works while a focus timer runs, not on a break", () => {
  const t = { ...base, timerEnd: base.now + 60000 };
  assert.strictEqual(pick({ ...t, timerLabel: "Focus" }), "work");
  assert.strictEqual(pick({ ...t, timerLabel: "Break" }), "idle");
});

test("a fresh pop-up startles it for 4 seconds only", () => {
  assert.strictEqual(pick({ ...base, toastAt: base.now - 1000 }), "alert");
  assert.strictEqual(pick({ ...base, toastAt: base.now - 4000 }), "idle");
});

test("it sleeps after 2 quiet minutes", () => {
  assert.strictEqual(pick({ ...base, quietSince: base.now - 119000 }), "idle");
  assert.strictEqual(pick({ ...base, quietSince: base.now - 120000 }), "sleep");
});

test("a low battery off the charger makes it sick, above everything else", () => {
  const sick = { ...base, playing: true, toastAt: base.now, battery: { level: 0.15, charging: false } };
  assert.strictEqual(pick(sick), "sick");
  assert.strictEqual(pick({ ...sick, battery: { level: 0.15, charging: true } }), "alert");
  assert.strictEqual(pick({ ...sick, battery: { level: 0.5, charging: false } }), "alert");
});

test("paint sets one mood class and leaves the DOM alone when it is unchanged", () => {
  const classes = new Set();
  const el = { dataset: {}, firstChild: null, innerHTML: "", classList: { remove: (...c) => c.forEach(x => classes.delete(x)), add: c => classes.add(c) } };
  paint([el], "dance");
  assert.ok(el.innerHTML.includes("<svg"));
  assert.deepStrictEqual([...classes], ["dance"]);
  paint([el], "sleep");
  assert.deepStrictEqual([...classes], ["sleep"]);
  assert.ok(MOODS.includes(el.dataset.mood));
});

test("the first open of the day greets by time and name, then the cat talks about its mood", () => {
  const { line } = require("../renderer/pet");
  assert.strictEqual(line({ hour: 9, name: "Gopinath", mood: "idle", firstToday: true }), "Good morning, Gopinath!");
  assert.strictEqual(line({ hour: 20, name: "", mood: "idle", firstToday: true }), "Good evening!");
  assert.strictEqual(line({ hour: 20, name: "Asha", mood: "dance", firstToday: false }), "Nice song!");
  assert.strictEqual(line({ hour: 20, name: "Asha", mood: "idle", firstToday: false }), "Hello, Asha!");
});
