const test = require("node:test");
const assert = require("node:assert");
const build = require("../src/build-status");
const bridge = require("../src/claude-bridge");

test("kind spots tests and builds", () => {
  assert.equal(build.kind("npm test"), "test");
  assert.equal(build.kind("cd app && npx vitest run"), "test");
  assert.equal(build.kind("cargo test --release"), "test");
  assert.equal(build.kind("python -m pytest -q"), "test");
  assert.equal(build.kind("npm run build"), "build");
  assert.equal(build.kind("cargo build"), "build");
  assert.equal(build.kind("git status"), "");
  assert.equal(build.kind(""), "");
  assert.equal(build.kind(undefined), "");
});

test("result reads counts from common runners", () => {
  assert.deepEqual(build.result("# tests 5\n# pass 5\n# fail 0\n"), { ok: true, passed: 5, failed: 0 });
  assert.deepEqual(build.result("# pass 3\n# fail 2\n"), { ok: false, passed: 3, failed: 2 });
  assert.deepEqual(build.result("test result: ok. 12 passed; 0 failed; 0 ignored"), { ok: true, passed: 12, failed: 0 });
  assert.deepEqual(build.result("Tests:       1 failed, 12 passed, 13 total"), { ok: false, passed: 12, failed: 1 });
  assert.deepEqual(build.result("     Tests  2 failed | 10 passed (12)"), { ok: false, passed: 10, failed: 2 });
  assert.deepEqual(build.result("===== 3 failed, 40 passed in 1.2s ====="), { ok: false, passed: 40, failed: 3 });
  assert.deepEqual(build.result("===== 40 passed in 1.2s ====="), { ok: true, passed: 40, failed: 0 });
  assert.deepEqual(build.result("  7 passing (20ms)\n  1 failing"), { ok: false, passed: 7, failed: 1 });
});

test("result without counts falls back to error words", () => {
  assert.deepEqual(build.result("Compiled successfully"), { ok: true, passed: null, failed: null });
  assert.equal(build.result("src/a.ts(3,1): error TS2304: x").ok, false);
  assert.equal(build.result("error[E0425]: cannot find value").ok, false);
  assert.equal(build.result("all fine", true).ok, false);
});

test("label", () => {
  assert.equal(build.label("test", { ok: true, passed: 12, failed: 0 }), "12 passed");
  assert.equal(build.label("test", { ok: false, passed: 12, failed: 2 }), "2 of 14 failed");
  assert.equal(build.label("build", { ok: false, passed: null, failed: null }), "Build failed");
});

test("bridge turns shell hook events into build events", () => {
  const ev = (event, command, output) => bridge.buildEvent({ event, session: "s", cwd: "C:/x/app", tool: "Bash", toolInput: { command }, output });
  assert.equal(ev("PreToolUse", "npm test").state, "running");
  const done = ev("PostToolUse", "npm test", "# pass 4\n# fail 0");
  assert.equal(done.state, "pass");
  assert.equal(done.label, "4 passed");
  assert.equal(done.project, "app");
  assert.equal(ev("PostToolUse", "ls"), null);
  assert.equal(bridge.buildEvent({ event: "PostToolUse", session: "s", tool: "Edit", toolInput: { command: "npm test" } }), null);
  assert.equal(bridge.buildEvent({ event: "PostToolUse", session: "s", tool: "shell", toolInput: { command: ["npm", "test"] }, output: "# pass 1\n# fail 1" }).state, "fail");
});
