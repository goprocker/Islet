const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { score, rank, appsFromLinks, appsFromStartApps, COMMANDS } = require("../search");

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
