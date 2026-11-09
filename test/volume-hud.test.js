const test = require("node:test");
const assert = require("node:assert");
const { parse, change } = require("../src/volume-hud");

const r = (vol, mute = false, bright = null, mic = null) => ({ vol, mute, mic, bright });

test("reads a helper line and rejects junk", () => {
  assert.deepStrictEqual(parse('{"vol":0.42,"mute":false,"bright":55}'), r(0.42, false, 55));
  assert.deepStrictEqual(parse('{"vol":0.3,"mute":true,"bright":null}'), r(0.3, true, null));
  assert.strictEqual(parse("not json"), null);
  assert.strictEqual(parse('{"mute":false}'), null);
  assert.strictEqual(parse('{"vol":"loud"}'), null);
});

test("out of range values are clamped", () => {
  assert.deepStrictEqual(parse('{"vol":1.7,"mute":false,"bright":140}'), r(1, false, 100));
  assert.strictEqual(parse('{"vol":-1,"mute":false,"bright":-5}').vol, 0);
});

test("the first reading is only a baseline", () => {
  assert.strictEqual(change(null, r(0.5)), null);
});

test("a volume step shows the volume, tiny drift does not", () => {
  assert.deepStrictEqual(change(r(0.5), r(0.52)), { kind: "volume", level: 0.52, muted: false });
  assert.strictEqual(change(r(0.5), r(0.502)), null);
});

test("muting and unmuting show mute, even when the level is unchanged", () => {
  assert.deepStrictEqual(change(r(0.5), r(0.5, true)), { kind: "mute", level: 0.5, muted: true });
  assert.deepStrictEqual(change(r(0.5, true), r(0.5)), { kind: "mute", level: 0.5, muted: false });
});

test("raising the volume while muted reports it as muted", () => {
  assert.deepStrictEqual(change(r(0.5, true), r(0.6, true)), { kind: "volume", level: 0.6, muted: true });
});

test("brightness changes show as a fraction; no screen reading is ignored", () => {
  assert.deepStrictEqual(change(r(0.5, false, 40), r(0.5, false, 60)), { kind: "brightness", level: 0.6, muted: false });
  assert.strictEqual(change(r(0.5, false, null), r(0.5, false, null)), null);
  assert.strictEqual(change(r(0.5, false, null), r(0.5, false, 60)), null);
});

test("reads the microphone state when there is one", () => {
  assert.strictEqual(parse('{"vol":0.5,"mute":false,"mic":true,"bright":null}').mic, true);
  assert.strictEqual(parse('{"vol":0.5,"mute":false,"mic":null,"bright":null}').mic, null);
  assert.strictEqual(parse('{"vol":0.5,"mute":false,"bright":null}').mic, null);
});

test("muting or unmuting the microphone shows the mic, and only a real change counts", () => {
  assert.deepStrictEqual(change(r(0.5, false, null, false), r(0.5, false, null, true)), { kind: "mic", level: 0, muted: true });
  assert.deepStrictEqual(change(r(0.5, false, null, true), r(0.5, false, null, false)), { kind: "mic", level: 0, muted: false });
  assert.strictEqual(change(r(0.5, false, null, false), r(0.5, false, null, false)), null);
  assert.strictEqual(change(r(0.5, false, null, null), r(0.5, false, null, true)), null); // a mic appearing is not a mute
});
