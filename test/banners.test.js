const test = require("node:test");
const assert = require("node:assert");
const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

// reg.exe stand-in: `importFails` makes `reg import` throw, `registry` is what `reg query` sees
let importFails = false, registry = {}, imports = 0, onImport = null;
const KEY = "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings\\";
const realExec = cp.execFileSync;
cp.execFileSync = (cmd, args) => {
  if (args[0] === "import") { imports++; onImport?.(); if (importFails) throw new Error("access denied"); return ""; }
  return Object.entries(registry).map(([id, v]) => `${KEY}${id}\r\n    ShowBanner    REG_DWORD    0x${v.toString(16)}\r\n`).join("\r\n");
};
const { restoreBanners, hideBanners, saveJournal } = require("../notifications");
cp.execFileSync = realExec;

test("a failed restore keeps the saved values for a retry", () => {
  importFails = true; registry = { AppOne: 0 };
  const saved = { AppOne: 1 };
  assert.strictEqual(restoreBanners(saved), 1);
  assert.deepStrictEqual(saved, { AppOne: 1 });
});
test("an import that doesn't land keeps the saved value", () => {
  importFails = false; registry = { AppOne: 0 };
  const saved = { AppOne: 1 };
  assert.strictEqual(restoreBanners(saved), 1);
  assert.deepStrictEqual(saved, { AppOne: 1 });
});
test("restored values are dropped once the registry shows them", () => {
  importFails = false; registry = { AppOne: 1 };
  const saved = { AppOne: 1, AppTwo: null };
  assert.strictEqual(restoreBanners(saved), 0);
  assert.deepStrictEqual(saved, {});
});

test("the journal is on disk before the registry changes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "islet-banners-"));
  const file = path.join(dir, "banners.json");
  try {
    importFails = false; registry = { ExampleApp: 1 };
    let atImport = null;
    onImport = () => { atImport = JSON.parse(fs.readFileSync(file, "utf8")); };
    const saved = {};
    hideBanners(saved, ["ExampleApp", "NotSetYet"], v => saveJournal(file, v));
    assert.deepStrictEqual(atImport, { ExampleApp: 1, NotSetYet: null });
    assert.deepStrictEqual(saved, { ExampleApp: 1, NotSetYet: null });
  } finally { onImport = null; fs.rmSync(dir, { recursive: true, force: true }); }
});
test("no journal, no suppression", () => {
  importFails = false; registry = { ExampleApp: 1 }; imports = 0;
  const saved = {};
  const missed = hideBanners(saved, ["ExampleApp"], () => { throw new Error("disk full"); });
  assert.strictEqual(imports, 0);
  assert.strictEqual(missed, 1);
  assert.deepStrictEqual(saved, {});
});
test("an app already in the journal is not saved again", () => {
  importFails = false; registry = { ExampleApp: 1 }; imports = 0;
  let writes = 0;
  hideBanners({ ExampleApp: 1 }, ["ExampleApp"], () => { writes++; });
  assert.strictEqual(writes, 0);
  assert.strictEqual(imports, 1);
});
test("a process killed right after the import leaves a journal the next run can restore", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "islet-banners-"));
  const file = path.join(dir, "banners.json");
  const script = path.join(dir, "crash.js");
  fs.writeFileSync(script, `
    const cp = require("child_process");
    cp.execFileSync = (cmd, args) => {
      if (args[0] === "import") process.exit(7); // dies with the registry already changed
      return "";
    };
    const n = require(${JSON.stringify(path.resolve(__dirname, "../notifications.js"))});
    n.hideBanners({}, ["ExampleApp"], v => n.saveJournal(${JSON.stringify(file)}, v));
  `);
  try {
    const run = cp.spawnSync(process.execPath, [script]);
    assert.strictEqual(run.status, 7);
    const journal = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.deepStrictEqual(journal, { ExampleApp: null });
    // next start: the journal still knows how to undo it
    importFails = false; registry = {};
    assert.strictEqual(restoreBanners(journal), 0);
    assert.deepStrictEqual(journal, {});
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test("saveJournal replaces the file whole and leaves no temp file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "islet-banners-"));
  const file = path.join(dir, "banners.json");
  try {
    saveJournal(file, { A: 1 });
    saveJournal(file, { B: null });
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, "utf8")), { B: null });
    assert.deepStrictEqual(fs.readdirSync(dir), ["banners.json"]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
