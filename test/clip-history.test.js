const test = require("node:test");
const assert = require("node:assert");
const { clipHistory } = require("../clip-history");

test("newest first, duplicates move to the front, capped at max", () => {
  const h = clipHistory({ max: 3 });
  for (const t of ["a", "b", "c", "d"]) h.add(t);
  h.add("c");
  assert.deepStrictEqual(h.view().map(v => v.text), ["c", "d", "b"]);
});

test("pinned items stay on top, survive Clear and don't count toward max", () => {
  const h = clipHistory({ max: 2 });
  h.add("a"); h.add("b");
  h.togglePin(h.view().findIndex(v => v.text === "a"));
  h.add("c"); h.add("d"); h.add("e"); h.add("f");
  assert.strictEqual(h.view()[0].pin, true);
  assert.strictEqual(h.view().length, 3); // a + the 2 newest
  h.clear();
  assert.strictEqual(h.view().length, 1);
  assert.strictEqual(h.view()[0].pin, true);
});

test("pins are saved, restored and unpinning updates the file", () => {
  let saved = null;
  const h = clipHistory({ save: p => (saved = p) });
  h.add("keep"); h.add("temp");
  h.togglePin(h.view().findIndex(v => v.text === "keep"));
  assert.deepStrictEqual(saved, ["keep"]);
  const again = clipHistory({ pins: saved });
  assert.deepStrictEqual(again.view(), [{ text: "keep", pin: true }]);
  again.togglePin(0);
  assert.strictEqual(again.view()[0].pin, false);
});

test("text() follows the view order and view() flattens whitespace", () => {
  const h = clipHistory();
  h.add("x"); h.add("line1\n  line2");
  assert.strictEqual(h.text(0), "line1\n  line2");
  assert.strictEqual(h.view()[0].text, "line1 line2");
  assert.strictEqual(h.text(9), undefined);
});
