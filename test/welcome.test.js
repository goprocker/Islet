const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { needsWelcome, finishWelcome } = require("../src/welcome");

function withDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "islet-welcome-"));
  try { fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test("a fresh install gets the welcome window", () => withDir(dir => {
  assert.equal(needsWelcome(dir), true);
}));

test("it stays pending until finished, so closing it shows it again", () => withDir(dir => {
  needsWelcome(dir);
  assert.equal(needsWelcome(dir), true);
}));

test("finishing shows it only once", () => withDir(dir => {
  finishWelcome(dir);
  assert.equal(needsWelcome(dir), false);
}));

for (const flag of ["hooks-set", "login-set", "login-set-installed"]) {
  test(`someone upgrading with ${flag} skips it`, () => withDir(dir => {
    fs.writeFileSync(path.join(dir, flag), "1");
    assert.equal(needsWelcome(dir), false);
  }));
}

test("finishing sets the first-run flags, so declined hooks and auto-start aren't enabled later", () => withDir(dir => {
  finishWelcome(dir);
  for (const flag of ["hooks-set", "codex-hooks-set", "login-set", "login-set-installed"]) assert.ok(fs.existsSync(path.join(dir, flag)), flag);
}));
