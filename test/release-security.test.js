const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

test("signed releases verify the SignPath publisher, unsigned ones still build", () => {
  const workflow = fs.readFileSync(path.join(__dirname, "../.github/workflows/release.yml"), "utf8").replace(/\r\n/g, "\n");
  assert.match(workflow, /Get-AuthenticodeSignature/);
  assert.match(workflow, /CN=SignPath Foundation/);
  assert.match(workflow, /Sign with SignPath\n\s+if: env\.SIGNPATH_API_TOKEN != ''/);
  assert.match(workflow, /Verify expected Windows publisher\n\s+if: env\.SIGNPATH_API_TOKEN != ''/);
  assert.doesNotMatch(workflow, /Require production signing configuration/);
});
