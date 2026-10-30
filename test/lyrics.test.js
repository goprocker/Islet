const test = require("node:test");
const assert = require("node:assert");
const { parse } = require("../lyrics");

test("a line with two stamps gives two entries", () => {
  assert.deepStrictEqual(parse("[00:10.00][00:20.00]Repeated chorus"), [{ t: 10, line: "Repeated chorus" }, { t: 20, line: "Repeated chorus" }]);
});
test("repeats between single lines come out in time order", () => {
  const lrc = "[00:10.00][00:30.00]Chorus\n[00:20.00]Verse\n[00:40.50] Outro ";
  assert.deepStrictEqual(parse(lrc), [
    { t: 10, line: "Chorus" }, { t: 20, line: "Verse" }, { t: 30, line: "Chorus" }, { t: 40.5, line: "Outro" },
  ]);
});
test("fractions, minutes and spaces between stamps", () => {
  assert.deepStrictEqual(parse("[01:02.50] [02:03.25] Words"), [{ t: 62.5, line: "Words" }, { t: 123.25, line: "Words" }]);
});
test("metadata rows and plain text are ignored", () => {
  assert.deepStrictEqual(parse("[ar:Someone]\n[ti:Song]\n[offset:+200]\nnot a lyric\n[00:01.00]Hi"), [{ t: 1, line: "Hi" }]);
  assert.strictEqual(parse("[ar:Someone]\nplain"), null);
});
test("an empty stamped row stays as a pause", () => {
  assert.deepStrictEqual(parse("[00:05.00]"), [{ t: 5, line: "" }]);
});
test("Windows line endings", () => {
  assert.deepStrictEqual(parse("[00:01.00]One\r\n[00:02.00]Two\r\n"), [{ t: 1, line: "One" }, { t: 2, line: "Two" }]);
});
