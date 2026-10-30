const test = require("node:test");
const assert = require("node:assert");
const { nextEvent } = require("../calendar");

const event = (start, rule, extra = "") => `BEGIN:VEVENT\nDTSTART${start}\n${rule ? `RRULE:${rule}\n` : ""}${extra}SUMMARY:Test\nEND:VEVENT`;
function inZone(tz, fn) {
  const was = process.env.TZ;
  process.env.TZ = tz;
  try { fn(); } finally { if (was === undefined) delete process.env.TZ; else process.env.TZ = was; }
}
const at = (ics, now) => nextEvent(ics, new Date(now))?.start;
const ms = Date.parse;

// New York leaves daylight saving on 2026-11-01 and enters it on 2027-03-14
test("daily UTC event keeps its UTC time when the host's clock goes back", () => inZone("America/New_York", () => {
  assert.strictEqual(at(event(":20261030T100000Z", "FREQ=DAILY"), "2026-11-02T09:00:00Z"), ms("2026-11-02T10:00:00Z"));
}));
test("daily UTC event keeps its UTC time when the host's clock goes forward", () => inZone("America/New_York", () => {
  assert.strictEqual(at(event(":20270312T100000Z", "FREQ=DAILY"), "2027-03-15T09:00:00Z"), ms("2027-03-15T10:00:00Z"));
}));
test("weekly UTC event keeps its UTC time across both changes", () => inZone("America/New_York", () => {
  assert.strictEqual(at(event(":20261026T100000Z", "FREQ=WEEKLY"), "2026-11-02T09:00:00Z"), ms("2026-11-02T10:00:00Z"));
  assert.strictEqual(at(event(":20270308T100000Z", "FREQ=WEEKLY"), "2027-03-15T09:00:00Z"), ms("2027-03-15T10:00:00Z"));
}));
test("BYDAY of a UTC event means the UTC weekday, whatever the host's day is", () => inZone("America/New_York", () => {
  // 01:00Z on a Tuesday is still Monday evening in New York
  assert.strictEqual(at(event(":20261027T010000Z", "FREQ=WEEKLY;BYDAY=TU"), "2026-11-03T00:00:00Z"), ms("2026-11-03T01:00:00Z"));
}));
test("COUNT and UNTIL still hold across the change", () => inZone("America/New_York", () => {
  assert.strictEqual(at(event(":20261030T100000Z", "FREQ=DAILY;COUNT=4"), "2026-11-02T09:00:00Z"), ms("2026-11-02T10:00:00Z"));
  assert.strictEqual(at(event(":20261030T100000Z", "FREQ=DAILY;COUNT=3"), "2026-11-02T09:00:00Z"), undefined);
  assert.strictEqual(at(event(":20261030T100000Z", "FREQ=DAILY;UNTIL=20261102T100000Z"), "2026-11-02T09:00:00Z"), ms("2026-11-02T10:00:00Z"));
  assert.strictEqual(at(event(":20261030T100000Z", "FREQ=DAILY;UNTIL=20261102T095959Z"), "2026-11-02T09:00:00Z"), undefined);
}));
test("EXDATE of a UTC series still matches after the change", () => inZone("America/New_York", () => {
  assert.strictEqual(at(event(":20261030T100000Z", "FREQ=DAILY", "EXDATE:20261102T100000Z\n"), "2026-11-02T09:00:00Z"), undefined);
}));
test("a floating event keeps its local time of day across the change", () => inZone("America/New_York", () => {
  assert.strictEqual(at(event(":20261030T100000", "FREQ=DAILY"), "2026-11-02T14:00:00Z"), ms("2026-11-02T15:00:00Z")); // 10:00 EST
  assert.strictEqual(at(event(":20261030T100000", "FREQ=DAILY"), "2026-10-31T13:00:00Z"), ms("2026-10-31T14:00:00Z")); // 10:00 EDT
  assert.strictEqual(at(event(":20270312T100000", "FREQ=WEEKLY"), "2027-03-19T13:00:00Z"), ms("2027-03-19T14:00:00Z")); // 10:00 EDT
}));
test("a host far ahead of UTC gives the same UTC answers", () => inZone("Asia/Tokyo", () => {
  assert.strictEqual(at(event(":20261030T100000Z", "FREQ=DAILY"), "2026-11-02T09:00:00Z"), ms("2026-11-02T10:00:00Z"));
  assert.strictEqual(at(event(":20261027T230000Z", "FREQ=WEEKLY;BYDAY=TU"), "2026-11-03T22:00:00Z"), ms("2026-11-03T23:00:00Z"));
}));
