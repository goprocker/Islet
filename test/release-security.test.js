const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

test("Windows updates pin the publisher verified by release CI", () => {
  const pkg = require("../package.json");
  const workflow = fs.readFileSync(path.join(__dirname, "../.github/workflows/release.yml"), "utf8");
  assert.strictEqual(pkg.build.win.publisherName, "SignPath Foundation");
  assert.match(workflow, /Require production signing configuration/);
  assert.match(workflow, /Get-AuthenticodeSignature/);
  assert.match(workflow, /CN=SignPath Foundation/);
  assert.doesNotMatch(workflow, /Sign with SignPath\n\s+if:/);
});
