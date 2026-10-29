const test = require("node:test");
const assert = require("node:assert");

// fetch that answers only when the test says so
function deferredFetch() {
  const waiting = [];
  global.fetch = url => new Promise(resolve => waiting.push({ url: String(url), resolve }));
  return waiting;
}
const tick = () => new Promise(r => setTimeout(r, 0));
const soon = () => { const d = new Date(Date.now() + 3600e3); return d.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z"; };

test("calendar: a reply from the old link is dropped after turning it off", async () => {
  const waiting = deferredFetch();
  const cal = require("../calendar"), got = [];
  cal.poll("https://old.example/cal.ics", e => got.push(e));
  cal.poll("", e => got.push(e));
  waiting[0].resolve({ ok: true, text: async () => `BEGIN:VEVENT\nDTSTART:${soon()}\nSUMMARY:Old feed\nEND:VEVENT` });
  await tick(); await tick();
  assert.deepStrictEqual(got, [null]);
  cal.poll("", () => {}); // stop its timer
});

test("weather: a reply for the old city is dropped after turning it off", async () => {
  const waiting = deferredFetch();
  const wx = require("../weather"), got = [];
  wx.poll("Old city", "C", w => got.push(w));
  wx.poll("", "C", w => got.push(w));
  waiting[0].resolve({ json: async () => ({ results: [{ name: "Old city", latitude: 1, longitude: 2 }] }) });
  await tick(); await tick();
  if (waiting[1]) waiting[1].resolve({ json: async () => ({ current: { temperature_2m: 30, weather_code: 0, is_day: 1 } }) });
  await tick(); await tick();
  assert.deepStrictEqual(got, [null]);
});

test("weather: the current city still gets its reply", async () => {
  const waiting = deferredFetch();
  const wx = require("../weather"), got = [];
  wx.poll("Chennai", "C", w => got.push(w));
  waiting[0].resolve({ json: async () => ({ results: [{ name: "Chennai", latitude: 13, longitude: 80 }] }) });
  await tick(); await tick();
  waiting[1].resolve({ json: async () => ({ current: { temperature_2m: 30.4, weather_code: 0, is_day: 1 } }) });
  await tick(); await tick();
  assert.strictEqual(got[0].place, "Chennai");
  assert.strictEqual(got[0].temp, 30);
  wx.poll("", "C", () => {});
});
