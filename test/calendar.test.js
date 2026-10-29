const test = require("node:test");
const assert = require("node:assert");
const { nextEvent } = require("../calendar");

const ics = rrule => `BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20261026T100000Z\n${rrule ? `RRULE:${rrule}\n` : ""}SUMMARY:Test\nEND:VEVENT\nEND:VCALENDAR`;
const now = new Date("2026-10-28T09:00:00Z"); // Wednesday; DTSTART is Monday 26 Oct

test("COUNT=1 ends after the first occurrence", () => {
  assert.strictEqual(nextEvent(ics("FREQ=DAILY;COUNT=1"), now), null);
});
test("COUNT counts from DTSTART", () => {
  assert.strictEqual(nextEvent(ics("FREQ=DAILY;COUNT=3"), now).start, Date.parse("2026-10-28T10:00:00Z"));
  assert.strictEqual(nextEvent(ics("FREQ=DAILY;COUNT=2"), now), null);
});
test("WEEKLY BYDAY finds the next listed weekday", () => {
  assert.strictEqual(nextEvent(ics("FREQ=WEEKLY;BYDAY=MO,WE"), now).start, Date.parse("2026-10-28T10:00:00Z"));
});
test("WEEKLY without BYDAY repeats on the start weekday", () => {
  assert.strictEqual(nextEvent(ics("FREQ=WEEKLY"), new Date("2026-11-02T09:00:00Z")).start, Date.parse("2026-11-02T10:00:00Z"));
});
test("UNTIL in the past ends the series", () => {
  assert.strictEqual(nextEvent(ics("FREQ=DAILY;UNTIL=20261027T235959Z"), now), null);
});
test("unsupported FREQ is not guessed", () => {
  assert.strictEqual(nextEvent(ics("FREQ=MONTHLY"), now), null);
});
test("single event later today", () => {
  assert.strictEqual(nextEvent(ics(""), new Date("2026-10-26T09:00:00Z")).start, Date.parse("2026-10-26T10:00:00Z"));
});

const series = extra => `BEGIN:VEVENT\nUID:s1\nDTSTART:20261029T100000Z\nRRULE:FREQ=DAILY\nSUMMARY:Test\n${extra}END:VEVENT`;
const thu = new Date("2026-10-29T09:00:00Z");
test("a cancelled series is skipped", () => {
  assert.strictEqual(nextEvent(series("STATUS:CANCELLED\n"), thu), null);
});
test("EXDATE skips that occurrence", () => {
  // the next one (the 30th, 25 h away) is past the 24 h window, so nothing is left
  assert.strictEqual(nextEvent(series(""), thu).start, Date.parse("2026-10-29T10:00:00Z"));
  assert.strictEqual(nextEvent(series("EXDATE:20261029T100000Z\n"), thu), null);
  assert.strictEqual(nextEvent(series("EXDATE;TZID=UTC:20261028T100000Z,20261029T100000Z\n"), thu), null);
  assert.strictEqual(nextEvent(series("EXDATE:20261029T100000Z\n"), new Date("2026-10-29T11:00:00Z")).start, Date.parse("2026-10-30T10:00:00Z"));
});
test("a cancelled override removes only its date", () => {
  const ics = series("") + `\nBEGIN:VEVENT\nUID:s1\nRECURRENCE-ID:20261029T100000Z\nDTSTART:20261029T100000Z\nSTATUS:CANCELLED\nSUMMARY:Test\nEND:VEVENT`;
  assert.strictEqual(nextEvent(ics, thu), null);
  assert.strictEqual(nextEvent(ics, new Date("2026-10-29T11:00:00Z")).start, Date.parse("2026-10-30T10:00:00Z"));
});
test("a moved override replaces the series date instead of adding to it", () => {
  const ics = series("") + `\nBEGIN:VEVENT\nUID:s1\nRECURRENCE-ID:20261029T100000Z\nDTSTART:20261029T150000Z\nSUMMARY:Moved\nEND:VEVENT`;
  assert.deepStrictEqual(nextEvent(ics, thu), { title: "Moved", start: Date.parse("2026-10-29T15:00:00Z") });
});
