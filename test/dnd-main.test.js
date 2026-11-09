const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "../main.js"), "utf8");
const start = source.indexOf("// ---- Do Not Disturb:");
const end = source.indexOf("// ---- clipboard history:", start);
const piece = source.slice(start, end);

function setup(overrides = {}) {
  const config = { dnd: false, dndFrom: "", dndTo: "", dndSkipUntil: 0, ...overrides };
  const handlers = new Map();
  const context = {
    config,
    ipcMain: { on: (name, fn) => handlers.set(name, fn) },
    saveConfig() {}, send() {}, buildMenu() {}, tray: null,
    Date,
  };
  vm.runInNewContext(`${piece}; globalThis.dndApi = { setFocus: v => focusDnd = v, active: dndActive };`, context);
  return { config, toggle: () => handlers.get("toggleDnd")(), ...context.dndApi };
}

test("turning off DND clears overlapping focus, manual and scheduled sources", () => {
  const d = setup({ dnd: true, dndFrom: "00:00", dndTo: "23:59" });
  d.setFocus(true);
  d.toggle();
  assert.strictEqual(d.config.dnd, false);
  assert.ok(d.config.dndSkipUntil > Date.now());
  assert.strictEqual(d.active(), false);
});
