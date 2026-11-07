const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { score, rank, appsFromLinks, appsFromStartApps, scanFiles, withFiles, COMMANDS } = require("../src/search");

test("scores exact, prefix, word prefix, substring and in-order letters in that order", () => {
  const s = ["chrome", "chrome browser", "google chrome", "mychromebook", "chm"].map(t => score("chrome", t));
  assert.deepStrictEqual(s.slice(0, 4), [100, 90, 75, 60]);
  assert.strictEqual(score("cme", "chrome"), 40);
  assert.strictEqual(score("zzz", "chrome"), 0);
  assert.strictEqual(score("", "chrome"), 0);
});

test("matching ignores case and surrounding spaces", () => {
  assert.strictEqual(score("  CHROME ", "Chrome"), 100);
});

test("rank puts better matches first and keeps the order of equal ones", () => {
  const items = [{ title: "Notepad" }, { title: "Note" }, { title: "Keynote" }, { title: "Terminal" }];
  assert.deepStrictEqual(rank("note", items).map(i => i.title), ["Note", "Notepad", "Keynote"]);
  assert.deepStrictEqual(rank("not", [{ title: "Notes A" }, { title: "Notes B" }]).map(i => i.title), ["Notes A", "Notes B"]);
});

test("keywords find an item a little below a title match", () => {
  const found = rank("bluetooth", COMMANDS).map(i => i.id);
  assert.ok(found.includes("bluetooth-settings") && found.includes("bluetooth-toggle"));
  assert.deepStrictEqual(rank("wifi", COMMANDS).map(i => i.id).slice(0, 2).sort(), ["wifi-settings", "wifi-toggle"]);
  assert.ok(rank("volume", COMMANDS).some(i => i.id === "sound-settings"));
});

test("rank returns at most the limit, and nothing for an empty query", () => {
  const items = Array.from({ length: 20 }, (_, i) => ({ title: "App " + i }));
  assert.strictEqual(rank("app", items, 5).length, 5);
  assert.deepStrictEqual(rank("", items), []);
});

test("app list drops uninstallers and help links and keeps one per name", () => {
  const p = n => path.join("C:", "Start", n);
  const apps = appsFromLinks([p("Chrome.lnk"), p("Uninstall Chrome.lnk"), p("chrome.lnk"), p("Git Documentation.lnk"), p("Notepad.lnk"), p("Help.lnk")]);
  assert.deepStrictEqual(apps.map(a => a.name), ["Chrome", "Notepad"]);
  assert.strictEqual(apps[0].file, p("Chrome.lnk"));
});

test("every command opens something, toggles a radio or opens Islet", () => {
  for (const c of COMMANDS) assert.ok(c.uri || c.radio || c.islet, c.id);
  assert.strictEqual(new Set(COMMANDS.map(c => c.id)).size, COMMANDS.length);
});

test("letters in order only count when they are close together", () => {
  assert.strictEqual(score("chrm", "google chrome") > 0, true);
  assert.strictEqual(score("wifi", "windows defender firewall with advanced security"), 0);
  assert.strictEqual(score("ab", "a big banana"), 0); // two letters are too loose to guess
});

test("Start apps keep Store apps, drop junk and bad rows, and handle a single app", () => {
  const apps = appsFromStartApps([{ Name: "Notepad", AppID: "Microsoft.WindowsNotepad_8wekyb3d8bbwe!App" }, { Name: "Uninstall Foo", AppID: "x" }, { Name: "notepad", AppID: "y" }, { Name: "", AppID: "z" }, null, { Name: "Calculator" }]);
  assert.deepStrictEqual(apps, [{ name: "Notepad", appId: "Microsoft.WindowsNotepad_8wekyb3d8bbwe!App" }]);
  assert.deepStrictEqual(appsFromStartApps({ Name: "Paint", AppID: "p" }), [{ name: "Paint", appId: "p" }]);
});

test("scanFiles lists files and folders, skips hidden and bulky ones, and respects depth", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "islet-files-"));
  try {
    fs.mkdirSync(path.join(root, "Projects", "deep", "deeper", "deepest", "toolow"), { recursive: true });
    fs.mkdirSync(path.join(root, "node_modules", "pkg"), { recursive: true });
    fs.mkdirSync(path.join(root, ".git"));
    fs.writeFileSync(path.join(root, "report.docx"), "");
    fs.writeFileSync(path.join(root, ".secret"), "");
    fs.writeFileSync(path.join(root, "node_modules", "pkg", "x.js"), "");
    fs.writeFileSync(path.join(root, "Projects", "deep", "deeper", "deepest", "toolow", "gone.txt"), "");
    const files = await scanFiles([root], { depth: 3 });
    const names = files.map(f => f.title);
    assert.ok(names.includes("report.docx") && names.includes("Projects") && names.includes("node_modules"));
    assert.ok(!names.includes(".secret") && !names.includes(".git") && !names.includes("x.js"), "hidden and bulky folders are not entered");
    assert.ok(!names.includes("gone.txt"), "deeper than depth is left out");
    const doc = files.find(f => f.title === "report.docx");
    assert.deepStrictEqual({ kind: doc.kind, sub: doc.sub, path: doc.path }, { kind: "file", sub: root, path: path.join(root, "report.docx") });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("scanFiles stops at max and survives a missing folder", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "islet-files-"));
  try {
    for (let i = 0; i < 10; i++) fs.writeFileSync(path.join(root, "f" + i), "");
    assert.strictEqual((await scanFiles([root], { max: 4 })).length, 4);
    assert.deepStrictEqual(await scanFiles([path.join(root, "nope")]), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("a few file matches go after the other results and never push out more than three", () => {
  const top = Array.from({ length: 8 }, (_, i) => ({ id: "a" + i }));
  const files = Array.from({ length: 4 }, (_, i) => ({ id: "f" + i }));
  assert.deepStrictEqual(withFiles(top, files).map(r => r.id), ["a0", "a1", "a2", "a3", "a4", "f0", "f1", "f2"]);
  assert.deepStrictEqual(withFiles([{ id: "a0" }], []).map(r => r.id), ["a0"]);
  assert.deepStrictEqual(withFiles([{ id: "a0" }], [{ id: "f0" }]).map(r => r.id), ["a0", "f0"]);
});

test("a minimum score keeps loose letter matches out", () => {
  const items = [{ title: "swift-build-resolver.md" }, { title: "wifi-notes.txt" }, { title: "my-wifi" }];
  assert.deepStrictEqual(rank("wifi", items, 8, 60).map(i => i.title), ["wifi-notes.txt", "my-wifi"]);
  assert.strictEqual(rank("wifi", items).length, 3);
});
