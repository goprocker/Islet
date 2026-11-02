const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const Sliders = require("../renderer/sliders");

const element = () => {
  const attrs = {};
  return { attrs, tabIndex: 0, title: "", setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: k => { delete attrs[k]; } };
};

// the real key handlers from notch.js
const source = fs.readFileSync(path.join(__dirname, "../renderer/notch.js"), "utf8");
const start = source.indexOf("// ---- keyboard sliders");
const piece = source.slice(start, source.indexOf('$("play").onclick', start));
function setup(track) {
  const elements = { seekArea: {}, volArea: {} };
  const seeks = [], volumes = [];
  const timers = [];
  const context = {
    track, Date, Math, render() {},
    $: id => elements[id],
    window: { Sliders, bridge: { seek: s => seeks.push(s), volume: d => volumes.push(d) } },
    setTimeout: fn => { timers.push(fn); return timers.length; },
    clearTimeout: id => { timers[id - 1] = null; },
  };
  vm.runInNewContext(`${piece}; globalThis.api = { shownPos, canChangeVolume };`, context);
  const press = (id, key) => {
    let prevented = 0;
    elements[id].onkeydown({ key, preventDefault: () => { prevented++; } });
    return prevented;
  };
  return { press, seeks, volumes, flush: () => timers.splice(0).forEach(f => f?.()), track, api: context.api };
}
const song = (over = {}) => ({ title: "t", source: "Spotify.exe", duration: 100, position: 50, playing: false, ...over });

test("arrows, pages and ends move the song within bounds", () => {
  const t = setup(song());
  assert.strictEqual(t.press("seekArea", "ArrowRight"), 1);
  assert.strictEqual(t.track.position, 55);
  t.press("seekArea", "ArrowLeft"); t.press("seekArea", "ArrowLeft");
  assert.strictEqual(t.track.position, 45);
  t.press("seekArea", "PageUp");
  assert.strictEqual(t.track.position, 75);
  t.press("seekArea", "End"); t.press("seekArea", "ArrowRight");
  assert.strictEqual(t.track.position, 100);
  t.press("seekArea", "Home"); t.press("seekArea", "ArrowLeft");
  assert.strictEqual(t.track.position, 0);
});

test("holding a key sends only the final seek", () => {
  const t = setup(song());
  t.press("seekArea", "ArrowRight"); t.press("seekArea", "ArrowRight"); t.press("seekArea", "ArrowRight");
  t.flush();
  assert.deepStrictEqual(t.seeks, [65]);
});

test("no track means no seek, and other keys are left alone", () => {
  const none = setup(null);
  assert.strictEqual(none.press("seekArea", "ArrowRight"), 0);
  none.flush();
  assert.deepStrictEqual(none.seeks, []);
  const t = setup(song());
  assert.strictEqual(t.press("seekArea", "Tab"), 0);
  assert.strictEqual(t.press("volArea", "a"), 0);
});

test("volume keys send a change for Spotify only", () => {
  const t = setup(song());
  t.press("volArea", "ArrowUp"); t.press("volArea", "ArrowDown"); t.press("volArea", "End"); t.press("volArea", "Home");
  assert.deepStrictEqual(t.volumes, [0.05, -0.05, 1, -1]);
  const browser = setup(song({ source: "Chrome" }));
  assert.strictEqual(browser.press("volArea", "ArrowUp"), 0);
  assert.deepStrictEqual(browser.volumes, []);
});

test("seek values and focus follow the track", () => {
  const el = element();
  Sliders.syncSeek(el, 65.4, 200);
  assert.strictEqual(el.tabIndex, 0);
  assert.strictEqual(el.attrs["aria-valuenow"], "65");
  assert.strictEqual(el.attrs["aria-valuemax"], "200");
  assert.strictEqual(el.attrs["aria-valuetext"], "1 minutes 5 seconds of 3 minutes 20 seconds");
  Sliders.syncSeek(el, 0, 0);
  assert.strictEqual(el.tabIndex, -1);
  assert.strictEqual(el.attrs["aria-disabled"], "true");
  assert.strictEqual(el.attrs["aria-valuetext"], "Nothing playing");
});

test("volume values are left out until known", () => {
  const el = element();
  Sliders.syncVolume(el, null, true);
  assert.ok(!("aria-valuenow" in el.attrs));
  Sliders.syncVolume(el, 0.426, true);
  assert.strictEqual(el.attrs["aria-valuenow"], "43");
  Sliders.syncVolume(el, 0.5, false);
  assert.strictEqual(el.tabIndex, -1);
  assert.match(el.title, /only works for Spotify/);
});
