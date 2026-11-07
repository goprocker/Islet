const test = require("node:test");
const assert = require("node:assert");
const { fromCache, toCache } = require("../weather");

const W = { place: "Chennai", temp: 30, unit: "C", icon: "☀️", label: "Clear" };

test("the last forecast comes back for the same city and unit", () => {
  const text = toCache("Chennai", "C", W, 1000);
  assert.deepStrictEqual(fromCache(text, "Chennai", "C", 1000 + 60000), { ...W, cached: 1000 });
});
test("another city, another unit or an old forecast is not used", () => {
  const text = toCache("Chennai", "C", W, 1000);
  assert.strictEqual(fromCache(text, "London", "C", 2000), null);
  assert.strictEqual(fromCache(text, "Chennai", "F", 2000), null);
  assert.strictEqual(fromCache(text, "Chennai", "C", 1000 + 6 * 3600e3), null);
});
test("a broken or missing file is ignored", () => {
  assert.strictEqual(fromCache("", "Chennai", "C"), null);
  assert.strictEqual(fromCache("{not json", "Chennai", "C"), null);
  assert.strictEqual(fromCache(toCache("Chennai", "C", { error: "x" }, 1), "Chennai", "C", 2), null);
});
