const test = require("node:test");
const assert = require("node:assert");
const { parse, formats, addRecent } = require("../renderer/colors");

test("colours parse short and long hex in any case", () => {
  assert.deepStrictEqual(parse("#0A84FF"), { r: 10, g: 132, b: 255 });
  assert.deepStrictEqual(parse("fff"), { r: 255, g: 255, b: 255 });
  assert.strictEqual(parse("#12345"), null);
  assert.strictEqual(parse("red"), null);
  assert.strictEqual(parse(undefined), null);
});

test("colours are written out as HEX, RGB and HSL", () => {
  assert.deepStrictEqual(formats("#FF0000"), { hex: "#ff0000", rgb: "rgb(255, 0, 0)", hsl: "hsl(0, 100%, 50%)" });
  assert.deepStrictEqual(formats("#808080"), { hex: "#808080", rgb: "rgb(128, 128, 128)", hsl: "hsl(0, 0%, 50%)" });
  assert.strictEqual(formats("#0a84ff").hsl, "hsl(210, 100%, 52%)");
  assert.strictEqual(formats("#ff00ff").hsl, "hsl(300, 100%, 50%)");
  assert.strictEqual(formats("nope"), null);
});

test("recent colours put the newest first without repeats", () => {
  assert.deepStrictEqual(addRecent(["#111111", "#222222"], "#222222"), ["#222222", "#111111"]);
  assert.deepStrictEqual(addRecent(["#ABC", "junk"], "#000000"), ["#000000", "#aabbcc"]);
  assert.deepStrictEqual(addRecent(null, "#000000"), ["#000000"]);
  assert.strictEqual(addRecent(Array.from({ length: 8 }, (_, i) => `#00000${i}`), "#ffffff").length, 8);
  assert.deepStrictEqual(addRecent(["#111111"], "nope"), ["#111111"]);
});
