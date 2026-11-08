const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseVersion, compare, decide, installed } = require("../src/agent-updates");

test("only plain release versions are taken from the registry reply", () => {
  assert.strictEqual(parseVersion({ version: "2.1.7" }), "2.1.7");
  assert.strictEqual(parseVersion({ version: "0.50.0-alpha.1" }), null);
  assert.strictEqual(parseVersion({ version: 3 }), null);
  assert.strictEqual(parseVersion(null), null);
});

test("versions compare by number, not by text", () => {
  assert.ok(compare("1.10.0", "1.9.9") > 0);
  assert.ok(compare("1.0.0", "1.0.1") < 0);
  assert.strictEqual(compare("2.0.0", "2.0.0"), 0);
});

test("the first check records a version without announcing it", () => {
  assert.deepStrictEqual(decide("", "1.0.0"), { seen: "1.0.0", announce: false });
});

test("a newer release is announced once, an older or failed check is not", () => {
  assert.deepStrictEqual(decide("1.0.0", "1.1.0"), { seen: "1.1.0", announce: true });
  assert.deepStrictEqual(decide("1.1.0", "1.1.0"), { seen: "1.1.0", announce: false });
  assert.deepStrictEqual(decide("1.1.0", "1.0.0"), { seen: "1.1.0", announce: false });
  assert.deepStrictEqual(decide("1.1.0", null), { seen: "1.1.0", announce: false });
});

test("only agents with a config folder in the home directory are watched", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "agents-"));
  assert.deepStrictEqual(installed(home), []);
  fs.mkdirSync(path.join(home, ".codex"));
  assert.deepStrictEqual(installed(home), ["codex"]);
});
