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

const rule = (start, rr) => `BEGIN:VEVENT\nDTSTART:${start}\nRRULE:${rr}\nSUMMARY:X\nEND:VEVENT`;
test("a February-only daily rule doesn't appear in October", () => {
  assert.strictEqual(nextEvent(rule("20260201T100000Z", "FREQ=DAILY;BYMONTH=2"), new Date("2026-10-30T09:00:00Z")), null);
});
for (const part of ["BYMONTH=2", "BYMONTHDAY=15", "BYSETPOS=1", "BYHOUR=9", "BYMINUTE=30", "BYSECOND=5", "BYWEEKNO=5", "BYYEARDAY=40", "X-OTHER=1"]) {
  test(`weekly rule with ${part} isn't repeated`, () => {
    assert.strictEqual(nextEvent(rule("20260105T100000Z", `FREQ=WEEKLY;${part}`), new Date("2026-10-26T09:00:00Z")), null);
  });
}
test("a BYDAY with a position isn't guessed at", () => {
  assert.strictEqual(nextEvent(rule("20260105T100000Z", "FREQ=DAILY;BYDAY=1MO"), new Date("2026-10-26T09:00:00Z")), null);
  assert.strictEqual(nextEvent(rule("20260105T100000Z", "FREQ=WEEKLY;BYDAY=XX"), new Date("2026-10-26T09:00:00Z")), null);
});
test("an unsupported rule still shows its first date", () => {
  assert.strictEqual(nextEvent(rule("20261030T100000Z", "FREQ=DAILY;BYMONTH=10"), new Date("2026-10-30T09:00:00Z")).start, Date.parse("2026-10-30T10:00:00Z"));
});
// the RFC 5545 example: the same rule gives different dates with a different week start
const rfc = wkst => rule("19970805T090000Z", `FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=${wkst}`);
const series = (ics, from) => {
  const out = [];
  for (let now = new Date(from), next; (next = nextEvent(ics, now)) || now < new Date("1997-09-10T00:00:00Z");) {
    if (next) { out.push(new Date(next.start).toISOString().slice(5, 10)); now = new Date(next.start + 1000); }
    else now = new Date(now.getTime() + 864e5);
  }
  return out;
};
test("WKST decides which weeks an INTERVAL counts", () => {
  assert.deepStrictEqual(series(rfc("MO"), "1997-08-05T00:00:00Z"), ["08-05", "08-10", "08-19", "08-24"]);
  assert.deepStrictEqual(series(rfc("SU"), "1997-08-05T00:00:00Z"), ["08-05", "08-17", "08-19", "08-31"]);
});
test("WKST alone leaves a rule supported", () => {
  assert.strictEqual(nextEvent(rule("20261026T100000Z", "FREQ=WEEKLY;WKST=SU"), new Date("2026-11-02T09:00:00Z")).start, Date.parse("2026-11-02T10:00:00Z"));
});
