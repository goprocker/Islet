// #161: every test total in the guide and README names the same numbers, and the file count is real
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const files = fs.readdirSync(__dirname).filter(f => f.endsWith(".test.js")).length;

test("docs: guide and README agree on the test totals", () => {
  const guide = fs.readFileSync(path.join(root, "docs/guide/guide.html"), "utf8");
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  const fileCounts = [...guide.matchAll(/(\d+) files, (\d+) (?:tests|passing)/g)].map(m => +m[1]);
  const totals = [
    ...[...guide.matchAll(/(\d+) files, (\d+) (?:tests|passing)/g)].map(m => +m[2]),
    ...[...guide.matchAll(/(\d+) tests in (\d+) files/g)].map(m => +m[1]),
    ...[...readme.matchAll(/(\d+)(?: tests|%20) passing/g)].map(m => +m[1]),
  ];
  assert.ok(fileCounts.length && totals.length);
  for (const n of fileCounts) assert.strictEqual(n, files, "guide file count");
  for (const m of guide.matchAll(/(\d+) tests in (\d+) files/g)) assert.strictEqual(+m[2], files, "guide file count");
  assert.strictEqual(new Set(totals).size, 1, `totals disagree: ${totals}`);
});
