const test = require("node:test");
const assert = require("node:assert");
const cp = require("child_process");

// reg.exe stand-in: `importFails` makes `reg import` throw, `registry` is what `reg query` sees
let importFails = false, registry = {};
const KEY = "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings\\";
const realExec = cp.execFileSync;
cp.execFileSync = (cmd, args) => {
  if (args[0] === "import") { if (importFails) throw new Error("access denied"); return ""; }
  return Object.entries(registry).map(([id, v]) => `${KEY}${id}\r\n    ShowBanner    REG_DWORD    0x${v.toString(16)}\r\n`).join("\r\n");
};
const { restoreBanners } = require("../notifications");
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
