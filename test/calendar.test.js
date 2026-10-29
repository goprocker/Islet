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
