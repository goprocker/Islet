const test = require("node:test");
const assert = require("node:assert");
const { nextEvent } = require("../calendar");

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

