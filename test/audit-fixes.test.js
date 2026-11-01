const test = require("node:test");
const assert = require("node:assert");
const { checkConfig, clock } = require("../config-check");
const { nextEvent } = require("../calendar");
const { pickSessions } = require("../claude-bridge");

const DEFAULTS = { weatherCity: "", size: "normal", displayId: null, lyrics: true, permissionWaitSeconds: 8 };
test("config: wrong types fall back and are reported, good values and unknown keys stay", () => {
  const { config, invalid } = checkConfig({ weatherCity: 42, size: "huge", lyrics: false, displayId: null, extra: 1 }, DEFAULTS);
  assert.deepStrictEqual(config, { weatherCity: "", size: "normal", displayId: null, lyrics: false, permissionWaitSeconds: 8, extra: 1 });
  assert.deepStrictEqual(invalid.sort(), ["size", "weatherCity"]);
});
test("config: null is rejected where a string is needed", () => {
  assert.deepStrictEqual(checkConfig({ weatherCity: null }, DEFAULTS).invalid, ["weatherCity"]);
});

const NOW = new Date("2026-06-15T09:00:00Z");
const ics = (start, rule) => `BEGIN:VEVENT\nSUMMARY:E\nDTSTART:${start}\nRRULE:${rule}\nEND:VEVENT\n`;
for (const bad of ["1e999", "Infinity", "2147483647", "1001", "0", "-3", "1.5", "abc"]) {
  test(`calendar: INTERVAL=${bad} does no repeat work and uses the first date only`, () => {
    const began = Date.now();
    assert.strictEqual(nextEvent(ics("20200101T090000Z", `FREQ=WEEKLY;INTERVAL=${bad}`), NOW), null);
    assert.strictEqual(nextEvent(ics("20260615T100000Z", `FREQ=DAILY;INTERVAL=${bad}`), NOW).title, "E");
    assert.ok(Date.now() - began < 500);
  });
}
test("calendar: the largest allowed INTERVAL stays quick and correct", () => {
  const began = Date.now();
  assert.strictEqual(nextEvent(ics("20260615T100000Z", "FREQ=WEEKLY;INTERVAL=1000"), NOW).title, "E");
  assert.strictEqual(nextEvent(ics("20000101T090000Z", "FREQ=WEEKLY;INTERVAL=1000"), NOW), null);
  assert.ok(Date.now() - began < 500);
});
test("calendar: ordinary intervals still repeat", () => {
  assert.strictEqual(nextEvent(ics("20260601T100000Z", "FREQ=WEEKLY;INTERVAL=2"), NOW).title, "E");
});

const session = (status, time, cwd = "C:/project") => ({ agent: "codex", cwd, project: "project", status, time });
test("sessions: an older waiting session beats a newer working one in the same project", () => {
  assert.deepStrictEqual(pickSessions([session("working", 20), session("waiting", 10)]).map(s => s.status), ["waiting"]);
});
test("sessions: once nothing waits the newest shows again", () => {
  assert.deepStrictEqual(pickSessions([session("working", 20), session("done", 10)]).map(s => s.time), [20]);
});
test("sessions: other projects are unaffected", () => {
  assert.strictEqual(pickSessions([session("working", 20), session("waiting", 10, "C:/other")]).length, 2);
});

for (const bad of ["24:00", "12:60", "99:99", "7:30", 730]) {
  test(`config: impossible DND time ${bad} falls back and is reported`, () => {
    const { config, invalid } = checkConfig({ dndFrom: bad }, { dndFrom: "" });
    assert.strictEqual(config.dndFrom, "");
    assert.deepStrictEqual(invalid, ["dndFrom"]);
  });
}
for (const good of ["00:00", "23:59", ""]) {
  test(`config: DND time "${good}" is kept`, () => {
    const { config, invalid } = checkConfig({ dndTo: good }, { dndTo: "07:00" });
    assert.strictEqual(config.dndTo, good);
    assert.deepStrictEqual(invalid, []);
  });
}
test("config: the clock check used by settings save rejects what load rejects", () => {
  assert.strictEqual(clock("23:59"), true);
  assert.strictEqual(clock("24:00"), false);
  assert.strictEqual(clock(""), false);
});
