const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "../main.js"), "utf8");
const between = (a, b) => { const s = source.indexOf(a); return source.slice(s, source.indexOf(b, s)); };

// the real placement code and event wiring, with made-up monitors
function setup(displays, primary, size = "normal") {
  const handlers = {}, bounds = [], zoom = [];
  const context = {
    BASE_W: 672, BASE_H: 190,
    scale: () => ({ compact: 0.85, normal: 1, large: 1.2 })[size],
    config: { displayId: 2 },
    buildMenu() {},
    screen: { getAllDisplays: () => displays(), getPrimaryDisplay: () => primary(), on: (ev, fn) => { handlers[ev] = fn; } },
    win: { setBounds: b => bounds.push(b), webContents: { setZoomFactor: z => zoom.push(z) } },
  };
  vm.runInNewContext(between("function targetDisplay()", "function createWindow()") + between('screen.on("display-added"', "globalShortcut.register"), context);
  return { fire: () => handlers["display-metrics-changed"](), last: () => bounds.at(-1), zoom: () => zoom.at(-1) };
}
const display = (id, x, width) => ({ id, bounds: { x, y: 0, width, height: 1080 } });

test("a new resolution centres the notch again", () => {
  let width = 1920;
  const d = () => display(2, 0, width);
  const t = setup(() => [d()], d);
  width = 2560;
  t.fire();
  assert.strictEqual(t.last().x, (2560 - 672) / 2);
});

test("a scale change keeps the configured size and zoom", () => {
  const d = () => display(2, 0, 1920);
  const t = setup(() => [d()], d, "large");
  t.fire();
  assert.strictEqual(t.last().width, Math.round(672 * 1.2));
  assert.strictEqual(t.zoom(), 1.2);
});

test("unplugging the chosen monitor moves the notch to the primary", () => {
  let list = [display(1, 0, 1920), display(2, 1920, 1280)];
  const t = setup(() => list, () => list[0]);
  t.fire();
  assert.strictEqual(t.last().x, 1920 + (1280 - 672) / 2);
  list = [display(1, 0, 1920)];
  t.fire();
  assert.strictEqual(t.last().x, (1920 - 672) / 2);
});
