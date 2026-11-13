const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { projectToOpen } = require("../src/open-project");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "islet-open-"));
const project = path.join(root, "project"), other = path.join(root, "other"), exe = path.join(project, "run.exe");
fs.mkdirSync(project); fs.mkdirSync(other); fs.writeFileSync(exe, "MZ");

test("a folder a session reported is opened", () => {
  assert.strictEqual(projectToOpen(project, new Set([project])), path.resolve(project));
  assert.strictEqual(projectToOpen(project.toUpperCase(), new Set([project])) !== null, process.platform === "win32");
});

test("a file, even one a session reported, is never opened", () => {
  assert.strictEqual(projectToOpen(exe, new Set([project, exe])), null);
});

test("a folder no session reported is ignored", () => {
  assert.strictEqual(projectToOpen(other, new Set([project])), null);
  assert.strictEqual(projectToOpen(project, new Set()), null);
});

test("junk, relative and missing paths are ignored", () => {
  for (const bad of [null, 42, "", "project", "..\project", path.join(root, "gone")]) {
    assert.strictEqual(projectToOpen(bad, new Set([project, path.join(root, "gone"), bad])), null, String(bad));
  }
});
