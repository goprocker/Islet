const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { EventEmitter } = require("events");
const { pathToFileURL } = require("url");
const { guard, allowed } = require("../src/window-guard");

const file = path.join(__dirname, "..", "settings", "settings.html");
const page = pathToFileURL(file).href;

function fakeWindow() {
  const wc = new EventEmitter();
  wc.setWindowOpenHandler = fn => { wc.openHandler = fn; };
  return { webContents: wc };
}
const navigate = (wc, ev, url) => { let stopped = false; wc.emit(ev, { preventDefault: () => { stopped = true; } }, url); return stopped; };

test("windows stay on their own page: other sites, other files and new windows are refused", () => {
  const win = guard(fakeWindow(), file), wc = win.webContents;
  assert.strictEqual(navigate(wc, "will-navigate", "https://example.com/"), true);
  assert.strictEqual(navigate(wc, "will-redirect", "http://127.0.0.1:8080/x"), true);
  assert.strictEqual(navigate(wc, "will-navigate", pathToFileURL(path.join(__dirname, "evil.html")).href), true);
  assert.strictEqual(navigate(wc, "will-navigate", "javascript:alert(1)"), true);
  assert.strictEqual(navigate(wc, "will-navigate", "not a url"), true);
  assert.deepStrictEqual(wc.openHandler({ url: "https://example.com/" }), { action: "deny" });
});

test("a jump to a section of the same page is still allowed", () => {
  const wc = guard(fakeWindow(), file).webContents;
  assert.strictEqual(navigate(wc, "will-navigate", page + "#agents"), false);
  assert.strictEqual(allowed(page.toUpperCase().replace("FILE:", "file:"), page), true);
});
