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

test("result adds up every go package and cargo test binary", () => {
  const pass = "ok   example.com/project/good 0.010s\n";
  const fail = "--- FAIL: TestBad (0.00s)\nFAIL example.com/project/bad 0.010s\nFAIL\n";
  assert.deepEqual(build.result(pass + fail), { ok: false, passed: 1, failed: 1 });
  assert.deepEqual(build.result(fail + pass), { ok: false, passed: 1, failed: 1 });
  assert.deepEqual(build.result(pass + "ok   example.com/project/more 0.020s\n"), { ok: true, passed: 2, failed: 0 });
  // go prints a tab between the columns
  assert.deepEqual(build.result("ok  \texample.com/a\t0.1s\nFAIL\texample.com/b\t0.2s\nFAIL\n"), { ok: false, passed: 1, failed: 1 });
  const bin = (ok, passed, failed) => `test result: ${ok}. ${passed} passed; ${failed} failed; 0 ignored\n`;
  assert.deepEqual(build.result(bin("ok", 12, 0) + bin("FAILED", 3, 1)), { ok: false, passed: 15, failed: 1 });
  assert.deepEqual(build.result(bin("FAILED", 3, 1) + bin("ok", 12, 0)), { ok: false, passed: 15, failed: 1 });
  assert.deepEqual(build.result(bin("ok", 12, 0) + bin("ok", 0, 0) + bin("ok", 5, 0)), { ok: true, passed: 17, failed: 0 });
});

test("a failed tool call wins over a passing summary or no output", () => {
  assert.equal(build.result("# pass 5\n# fail 0\n", true).ok, false);
  assert.equal(build.result("ok   example.com/a 0.1s\n", true).ok, false);
  assert.equal(build.result("", true).ok, false);
  assert.equal(build.result(undefined, true).ok, false);
  // the label does not claim a pass that the state denies
  assert.equal(build.label("test", build.result("# pass 5\n# fail 0\n", true)), "Tests failed");
  assert.equal(build.label("test", build.result("# pass 5\n# fail 0\n")), "5 passed");
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

test("bridge reports a failed go package behind a passing one, in either order", () => {
  const go = output => bridge.buildEvent({ event: "PostToolUse", session: "audit", tool: "Bash", toolInput: { command: "go test ./..." }, output });
  const good = "ok   example.com/project/good 0.010s\n";
  const bad = "--- FAIL: TestBad (0.00s)\nFAIL example.com/project/bad 0.010s\nFAIL\n";
  assert.equal(go(good + bad).state, "fail");
  assert.equal(go(good + bad).label, "1 of 2 failed");
  assert.equal(go(bad + good).state, "fail");
  assert.equal(go(good).state, "pass");
});

test("bridge reports a failed cargo test binary behind a passing one", () => {
  const cargo = output => bridge.buildEvent({ event: "PostToolUse", session: "s", tool: "Bash", toolInput: { command: "cargo test" }, output });
  const e = cargo("test result: ok. 12 passed; 0 failed; 0 ignored\ntest result: FAILED. 3 passed; 1 failed; 0 ignored\n");
  assert.equal(e.state, "fail");
  assert.equal(e.label, "1 of 16 failed");
});

test("bridge lets a failed tool call override a success summary or empty output", () => {
  const npm = (output, failed) => bridge.buildEvent({ event: "PostToolUse", session: "s", tool: "Bash", toolInput: { command: "npm test" }, output, failed });
  assert.equal(npm("# pass 4\n# fail 0", true).state, "fail");
  assert.equal(npm("", true).state, "fail");
  assert.equal(npm("# pass 4\n# fail 0", false).state, "pass");
  assert.equal(npm("# pass 4\n# fail 0").state, "pass");
});
