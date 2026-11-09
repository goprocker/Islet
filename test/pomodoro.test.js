const test = require("node:test");
const assert = require("node:assert");
const { next } = require("../src/pomodoro");

test("starts with a 25 minute focus", () => {
  assert.deepStrictEqual(next(null), { phase: "focus", round: 1, min: 25, label: "Focus 1/4" });
});

test("a short break follows focus rounds 1-3, a long one follows round 4", () => {
  assert.strictEqual(next({ phase: "focus", round: 1 }).min, 5);
  assert.strictEqual(next({ phase: "focus", round: 3 }).label, "Break");
  const long = next({ phase: "focus", round: 4 });
  assert.strictEqual(long.min, 15);
  assert.strictEqual(long.label, "Long break");
});

test("a break leads to the next focus round, wrapping after round 4", () => {
  assert.strictEqual(next({ phase: "break", round: 1 }).label, "Focus 2/4");
  assert.deepStrictEqual(next({ phase: "break", round: 4 }), { phase: "focus", round: 1, min: 25, label: "Focus 1/4" });
});

test("Do Not Disturb follows the focus phase only when the setting is on", () => {
  const { wantsDnd } = require("../src/pomodoro");
  assert.strictEqual(wantsDnd({ phase: "focus", round: 1 }, true), true);
  assert.strictEqual(wantsDnd({ phase: "break", round: 1 }, true), false);
  assert.strictEqual(wantsDnd({ phase: "focus", round: 1 }, false), false);
  assert.strictEqual(wantsDnd(null, true), false);
});
