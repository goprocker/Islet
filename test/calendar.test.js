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

test("old daily series without an end is still found", () => {
  const old = `BEGIN:VEVENT\nDTSTART:20000101T100000Z\nRRULE:FREQ=DAILY\nSUMMARY:Old\nEND:VEVENT`;
  assert.strictEqual(nextEvent(old, new Date("2026-10-29T09:00:00Z")).start, Date.parse("2026-10-29T10:00:00Z"));
});
test("COUNT still ends a long-running series after skipping ahead", () => {
  const ev = count => `BEGIN:VEVENT\nDTSTART:20260101T100000Z\nRRULE:FREQ=WEEKLY;BYDAY=MO,TH;COUNT=${count}\nSUMMARY:W\nEND:VEVENT`;
  // 2026-01-01 is a Thursday; Thu 29 Oct is occurrence 87 (Jan 1 + 43 weeks x 2), Mon 26 Oct is 86
  assert.strictEqual(nextEvent(ev(87), new Date("2026-10-29T09:00:00Z")).start, Date.parse("2026-10-29T10:00:00Z"));
  assert.strictEqual(nextEvent(ev(86), new Date("2026-10-29T09:00:00Z")), null);
});
test("100 daily series from 2007 are fast", () => {
  const one = `BEGIN:VEVENT\nDTSTART:20070101T100000Z\nRRULE:FREQ=DAILY;INTERVAL=3\nSUMMARY:X\nEND:VEVENT\n`;
  const t = performance.now();
  nextEvent(one.repeat(100), new Date("2026-10-29T09:00:00Z"));
  assert.ok(performance.now() - t < 50, `took ${performance.now() - t} ms`);
});
