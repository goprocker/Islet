const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { readShelf } = require("../shelf-file");

function withFile(text, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "islet-shelf-"));
  const file = path.join(dir, "shelf.json");
  const warn = console.warn;
  const warnings = [];
  console.warn = (...a) => warnings.push(a.join(" "));
  try {
    if (text !== null) fs.writeFileSync(file, text);
    fn(file, warnings);
  } finally {
    console.warn = warn;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

for (const text of ["null", "{}", "42", '"C:/some/file.txt"', "{ not json", "true"]) {
  test(`${text} gives an empty shelf, a warning and a kept copy`, () => {
    withFile(text, (file, warnings) => {
      assert.deepStrictEqual(readShelf(file), []);
      assert.strictEqual(warnings.length, 1);
      assert.strictEqual(fs.readFileSync(file, "utf8"), text);
      assert.strictEqual(fs.readFileSync(file + ".invalid", "utf8"), text);
    });
  });
}
test("invalid entries are dropped, valid paths kept, the original copied", () => {
  const text = JSON.stringify(["C:/a.txt", 5, null, "", {}, "C:/b.txt"]);
  withFile(text, (file, warnings) => {
    assert.deepStrictEqual(readShelf(file), ["C:/a.txt", "C:/b.txt"]);
    assert.strictEqual(warnings.length, 1);
    assert.strictEqual(fs.readFileSync(file + ".invalid", "utf8"), text);
  });
});
test("a valid list is returned quietly", () => {
  withFile(JSON.stringify(["C:/a.txt", "C:/b.txt"]), (file, warnings) => {
    assert.deepStrictEqual(readShelf(file), ["C:/a.txt", "C:/b.txt"]);
    assert.deepStrictEqual(warnings, []);
    assert.strictEqual(fs.existsSync(file + ".invalid"), false);
  });
});
test("an empty list and a missing file are normal", () => {
  withFile("[]", (file, warnings) => { assert.deepStrictEqual(readShelf(file), []); assert.deepStrictEqual(warnings, []); });
  withFile(null, (file, warnings) => { assert.deepStrictEqual(readShelf(file), []); assert.deepStrictEqual(warnings, []); });
});
