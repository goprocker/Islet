const test = require("node:test");
const assert = require("node:assert");
const { shapeRect, sameRect, MARGIN } = require("../shape");

const WIN = { width: 672, height: 270 };

test("the pill gets its own box, from the top edge", () => {
  assert.deepStrictEqual(shapeRect({ x: 261, width: 150, height: 30 }, 1, WIN), { x: 261 - MARGIN, y: 0, width: 150 + 2 * MARGIN, height: 30 + MARGIN });
});
test("the size setting's zoom scales it, and the window edges clamp it", () => {
  assert.deepStrictEqual(shapeRect({ x: 16, width: 640, height: 258 }, 1, WIN), { x: 16, y: 0, width: 640, height: 258 });
  assert.deepStrictEqual(shapeRect({ x: 600, width: 100, height: 300 }, 1, WIN), { x: 600, y: 0, width: 72, height: 270 });
  const big = { width: Math.round(672 * 1.2), height: Math.round(270 * 1.2) };
  assert.deepStrictEqual(shapeRect({ x: 261, width: 150, height: 30 }, 1.2, big), { x: 313, y: 0, width: 181, height: 36 });
});
test("a hidden notch keeps one pixel, never an empty shape that would make the window whole", () => {
  assert.deepStrictEqual(shapeRect({ x: 336, width: 0, height: 0 }, 1, WIN), { x: 336, y: 0, width: 1, height: 1 });
});
test("nonsense is refused", () => {
  assert.strictEqual(shapeRect(null, 1, WIN), null);
  assert.strictEqual(shapeRect({ x: NaN, width: 10, height: 10 }, 1, WIN), null);
  assert.strictEqual(shapeRect({ x: 1, width: 10, height: 10 }, 0, WIN), null);
  assert.strictEqual(shapeRect({ x: -5, width: 10, height: 10 }, 1, WIN), null);
});
test("sameRect compares every side", () => {
  assert.ok(sameRect({ x: 1, y: 0, width: 2, height: 3 }, { x: 1, y: 0, width: 2, height: 3 }));
  assert.ok(!sameRect({ x: 1, y: 0, width: 2, height: 3 }, { x: 1, y: 0, width: 2, height: 4 }));
  assert.ok(!sameRect(null, { x: 1, y: 0, width: 2, height: 3 }));
});
