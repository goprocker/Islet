const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SOURCE = fs.readFileSync(path.join(__dirname, "../settings/settings.js"), "utf8");
const tick = () => new Promise(r => setImmediate(r));
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

// the real settings.js against a small stand-in for its form
function open(initial) {
  const el = (name, type, extra = {}) => ({ name, type, value: "", checked: false, ...extra });
  const els = [
    el("weatherCity", "text"), el("downloadsFolder", "text"), el("idleHide", "checkbox"), el("permissionWaitSeconds", "number"),
    el("accentMode", "radio", { value: "album" }), el("accentMode", "radio", { value: "fixed" }), el("accentColor", "color"),
  ];
  const listeners = {};
  const on = (o, name) => { o.addEventListener = (ev, fn) => { (listeners[name + ev] ||= []).push(fn); }; return o; };
  for (const e of els) on(e, e.name);
  const form = on({
    querySelectorAll: () => els,
    querySelector(sel) {
      if (sel.includes(":checked")) return els.find(e => e.type === "radio" && e.checked);
      const [, name, value] = sel.match(/\[name="(\w+)"\](?:\[value="(\w+)"\])?/);
      return els.find(e => e.name === name && (!value || e.value === value));
    },
  }, "form");
  const load = deferred(), saves = [];
  const context = {
    document: { querySelector: () => form, getElementById: () => ({ textContent: "" }) },
    window: { settings: {
      load: () => load.promise,
      save: v => { const d = deferred(); saves.push({ values: v, ...d }); return d.promise; },
    } },
    setTimeout: () => 0, clearTimeout() {}, console,
  };
  vm.runInNewContext(SOURCE, context);
  const field = n => els.find(e => e.name === n);
  const change = () => listeners.formchange[0]();
  const ready = async () => { load.resolve({ weatherCity: "Chennai", downloadsFolder: "", idleHide: false, permissionWaitSeconds: 8, accent: "album", ...initial }); await tick(); };
  return { field, change, ready, load, saves, els };
}
const server = (values, over) => ({ weatherCity: values.weatherCity, downloadsFolder: values.downloadsFolder, idleHide: values.idleHide, permissionWaitSeconds: values.permissionWaitSeconds, accent: values.accent, ...over });

test("text typed while a save is pending survives its answer", async () => {
  const f = open();
  await f.ready();
  f.field("weatherCity").value = "London";
  f.change();
  f.field("weatherCity").value = "Tokyo"; // still typing, no change event yet
  f.saves[0].resolve(server(f.saves[0].values));
  await tick();
  assert.strictEqual(f.field("weatherCity").value, "Tokyo");
});
test("fields not touched since the save take the saved value", async () => {
  const f = open();
  await f.ready();
  f.field("weatherCity").value = " London ";
  f.field("permissionWaitSeconds").value = "99";
  f.change();
  f.field("downloadsFolder").value = "D:/new";
  f.saves[0].resolve(server(f.saves[0].values, { weatherCity: "London", permissionWaitSeconds: 24 }));
  await tick();
  assert.strictEqual(f.field("weatherCity").value, "London"); // cleaned up by the main process
  assert.strictEqual(f.field("permissionWaitSeconds").value, 24);
  assert.strictEqual(f.field("downloadsFolder").value, "D:/new");
});
test("with overlapping saves only the newest answer fills the form", async () => {
  const f = open();
  await f.ready();
  f.field("weatherCity").value = "London";
  f.change();
  f.field("weatherCity").value = "Tokyo";
  f.change();
  assert.strictEqual(f.saves[1].values.weatherCity, "Tokyo");
  f.saves[0].resolve(server(f.saves[0].values));
  await tick();
  assert.strictEqual(f.field("weatherCity").value, "Tokyo");
  f.saves[1].resolve(server(f.saves[1].values, { weatherCity: "TOKYO" }));
  await tick();
  assert.strictEqual(f.field("weatherCity").value, "TOKYO");
});
test("a colour picked during a save keeps its accent mode", async () => {
  const f = open();
  await f.ready();
  f.field("idleHide").checked = true;
  f.change();
  f.els[4].checked = false; f.els[5].checked = true; f.field("accentColor").value = "#123456";
  f.saves[0].resolve(server(f.saves[0].values));
  await tick();
  assert.strictEqual(f.els[5].checked, true);
  assert.strictEqual(f.field("accentColor").value, "#123456");
});
test("an edit made before the settings load survives, and is saved with them", async () => {
  const f = open();
  f.field("weatherCity").value = "Tokyo";
  f.change();
  assert.strictEqual(f.saves.length, 0); // the rest of the form is still empty
  await f.ready();
  assert.strictEqual(f.field("weatherCity").value, "Tokyo");
  assert.strictEqual(f.saves.length, 1);
  assert.strictEqual(f.saves[0].values.weatherCity, "Tokyo");
  assert.strictEqual(f.saves[0].values.permissionWaitSeconds, 8);
});
