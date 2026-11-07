const test = require("node:test");
const assert = require("node:assert");
const { state, action, TILES } = require("../src/quick-settings");

test("radio states become booleans, a missing radio is null", () => {
  const s = state({ wifi: "On", airplane: false }, { vol: 0.4, mute: false, bright: 55 });
  assert.strictEqual(s.wifi, true);
  assert.strictEqual(s.bluetooth, null);
  assert.strictEqual(s.airplane, false);
  assert.strictEqual(s.bright, 55);
});

test("failed scripts give an all-null state and levels are clamped", () => {
  const s = state(null, null);
  assert.deepStrictEqual([s.wifi, s.vol, s.bright, s.mute], [null, null, null, false]);
  const c = state({}, { vol: 5, bright: -3 });
  assert.deepStrictEqual([c.vol, c.bright], [1, 0]);
});

test("actions are whitelisted and normalised", () => {
  assert.deepStrictEqual(action("vol", 2), { kind: "vol", value: 1 });
  assert.deepStrictEqual(action("bright", 33.6), { kind: "bright", value: 34 });
  assert.strictEqual(action("vol", "loud"), null);
  assert.strictEqual(action("rm -rf", 1), null);
  assert.strictEqual(action("wifi").kind, "wifi");
  assert.strictEqual(action("airplane", true).on, true);
});

test("settings tiles map to their ms-settings page, radio tiles never carry a uri", () => {
  for (const t of TILES) assert.strictEqual(!!action(t.id)?.uri, t.kind === "settings");
});
