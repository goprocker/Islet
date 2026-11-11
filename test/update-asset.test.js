const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs"), os = require("os"), path = require("path");
const { updateAsset } = require("../build/update-asset");

test("auto-update gets its own copy of the installer, so updates aren't counted as downloads", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "islet-rel-"));
  fs.writeFileSync(path.join(dir, "Islet-Setup-9.9.9.exe"), "EXE");
  fs.writeFileSync(path.join(dir, "Islet-Setup-9.9.9.exe.blockmap"), "MAP");
  fs.writeFileSync(path.join(dir, "latest.yml"), "version: 9.9.9\nfiles:\n  - url: Islet-Setup-9.9.9.exe\n    sha512: abc\n    size: 3\npath: Islet-Setup-9.9.9.exe\nsha512: abc\n");
  assert.strictEqual(updateAsset(dir, "9.9.9"), "Islet-Update-9.9.9.exe");
  assert.strictEqual(fs.readFileSync(path.join(dir, "Islet-Update-9.9.9.exe"), "utf8"), "EXE");
  assert.strictEqual(fs.readFileSync(path.join(dir, "Islet-Update-9.9.9.exe.blockmap"), "utf8"), "MAP");
  assert.ok(fs.existsSync(path.join(dir, "Islet-Setup-9.9.9.exe")), "the download stays");
  const yml = fs.readFileSync(path.join(dir, "latest.yml"), "utf8");
  assert.ok(!yml.includes("Islet-Setup"));
  assert.match(yml, /url: Islet-Update-9\.9\.9\.exe/);
  assert.match(yml, /path: Islet-Update-9\.9\.9\.exe/);
  assert.match(yml, /sha512: abc/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the release workflow publishes the update copy and the site counts only Islet-Setup", () => {
  const root = path.join(__dirname, "..");
  const wf = fs.readFileSync(path.join(root, ".github/workflows/release.yml"), "utf8");
  assert.match(wf, /node build\/update-asset\.js dist/);
  assert.match(wf, /Islet-Update-\$v\.exe/);
  for (const f of ["landing/stats.js", "landing/build-stats.js"]) {
    assert.match(fs.readFileSync(path.join(root, f), "utf8"), /startsWith\("Islet-Setup-"\)/, f);
  }
});
