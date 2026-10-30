const test = require("node:test");
const assert = require("node:assert");
const { nextEvent } = require("../calendar");

function inZone(tz, fn) {
  const was = process.env.TZ;
  process.env.TZ = tz;
  try { fn(); } finally { if (was === undefined) delete process.env.TZ; else process.env.TZ = was; }
}
const event = (start, rule, extra = "") => `BEGIN:VEVENT\nUID:u1\nDTSTART${start}\n${rule ? `RRULE:${rule}\n` : ""}${extra}SUMMARY:Test\nEND:VEVENT`;
const at = (ics, now) => nextEvent(ics, new Date(now))?.start;
const ms = Date.parse;

test("a zone different from the host's is honoured", () => inZone("UTC", () => {
  assert.strictEqual(at(event(";TZID=Asia/Kolkata:20261030T150000"), "2026-10-30T08:00:00Z"), ms("2026-10-30T09:30:00Z"));
}));
test("TZID=UTC on a host in India", () => inZone("Asia/Kolkata", () => {
  assert.strictEqual(at(event(";TZID=UTC:20261030T150000"), "2026-10-30T14:00:00Z"), ms("2026-10-30T15:00:00Z"));
}));
test("floating times stay local and Z stays UTC", () => inZone("Asia/Kolkata", () => {
  assert.strictEqual(at(event(":20261030T150000"), "2026-10-30T08:00:00Z"), ms("2026-10-30T09:30:00Z"));
  assert.strictEqual(at(event(":20261030T150000Z"), "2026-10-30T14:00:00Z"), ms("2026-10-30T15:00:00Z"));
}));
test("EXDATE in the event's zone removes that occurrence", () => inZone("UTC", () => {
  const ics = event(";TZID=Asia/Kolkata:20261029T150000", "FREQ=DAILY", "EXDATE;TZID=Asia/Kolkata:20261030T150000\n");
  assert.strictEqual(at(ics, "2026-10-30T09:00:00Z"), undefined);
  assert.strictEqual(at(ics, "2026-10-31T09:00:00Z"), ms("2026-10-31T09:30:00Z"));
}));
test("a RECURRENCE-ID in another zone still replaces its date", () => inZone("UTC", () => {
  const ics = event(";TZID=Asia/Kolkata:20261029T150000", "FREQ=DAILY")
    + `\nBEGIN:VEVENT\nUID:u1\nRECURRENCE-ID;TZID=Asia/Kolkata:20261030T150000\nDTSTART;TZID=Asia/Kolkata:20261030T170000\nSUMMARY:Moved\nEND:VEVENT`;
  assert.deepStrictEqual(nextEvent(ics, new Date("2026-10-30T09:00:00Z")), { title: "Moved", start: ms("2026-10-30T11:30:00Z") });
}));
test("a repeating zoned event keeps its wall-clock time across that zone's changes", () => inZone("UTC", () => {
  const daily = event(";TZID=America/New_York:20261030T090000", "FREQ=DAILY");
  assert.strictEqual(at(daily, "2026-10-31T12:00:00Z"), ms("2026-10-31T13:00:00Z")); // 09:00 EDT
  assert.strictEqual(at(daily, "2026-11-02T13:00:00Z"), ms("2026-11-02T14:00:00Z")); // 09:00 EST
  const weekly = event(";TZID=America/New_York:20270308T090000", "FREQ=WEEKLY");
  assert.strictEqual(at(weekly, "2027-03-08T13:00:00Z"), ms("2027-03-08T14:00:00Z")); // 09:00 EST
  assert.strictEqual(at(weekly, "2027-03-15T12:00:00Z"), ms("2027-03-15T13:00:00Z")); // 09:00 EDT
}));
test("BYDAY means the weekday in the event's zone", () => inZone("UTC", () => {
  // Monday 22:00 in New York is already Tuesday in UTC
  const ics = event(";TZID=America/New_York:20261026T220000", "FREQ=WEEKLY;BYDAY=MO");
  assert.strictEqual(at(ics, "2026-11-03T02:00:00Z"), ms("2026-11-03T03:00:00Z"));
}));
test("UNTIL without Z is read in the event's zone", () => inZone("UTC", () => {
  const ev = until => event(";TZID=America/New_York:20261030T090000", `FREQ=DAILY;UNTIL=${until}`);
  assert.strictEqual(at(ev("20261031T090000"), "2026-10-31T12:00:00Z"), ms("2026-10-31T13:00:00Z"));
  assert.strictEqual(at(ev("20261031T085959"), "2026-10-31T12:00:00Z"), undefined);
}));
test("a clock reading that doesn't exist moves forward, one that happens twice takes the first", () => inZone("UTC", () => {
  assert.strictEqual(at(event(";TZID=America/New_York:20270314T023000"), "2027-03-14T06:00:00Z"), ms("2027-03-14T07:30:00Z"));
  assert.strictEqual(at(event(";TZID=America/New_York:20261101T013000"), "2026-11-01T04:00:00Z"), ms("2026-11-01T05:30:00Z"));
}));
test("Windows zone names and vendor prefixes", () => inZone("UTC", () => {
  for (const tz of ["India Standard Time", "/mozilla.org/20050126_1/Asia/Kolkata", '"India Standard Time"']) {
    assert.strictEqual(at(event(`;TZID=${tz}:20261030T150000`), "2026-10-30T08:00:00Z"), ms("2026-10-30T09:30:00Z"), tz);
  }
  assert.strictEqual(at(event(";TZID=Eastern Standard Time:20261030T090000"), "2026-10-30T12:00:00Z"), ms("2026-10-30T13:00:00Z"));
}));
test("an unknown zone is skipped with one warning, other events still show", () => inZone("UTC", () => {
  const warn = console.warn, warnings = [];
  console.warn = (...a) => warnings.push(a.join(" "));
  try {
    const bad = event(";TZID=Mars/Olympus:20261030T100000");
    assert.strictEqual(at(bad, "2026-10-30T08:00:00Z"), undefined);
    assert.strictEqual(at(bad, "2026-10-30T08:00:00Z"), undefined);
    assert.strictEqual(warnings.length, 1);
    assert.match(warnings[0], /Mars\/Olympus/);
    assert.strictEqual(at(`${bad}\n${event(":20261030T110000Z")}`, "2026-10-30T08:00:00Z"), ms("2026-10-30T11:00:00Z"));
  } finally { console.warn = warn; }
}));
test("a quoted TZID containing a colon reaches the warning instead of being misread", () => inZone("UTC", () => {
  const warn = console.warn, warnings = [];
  console.warn = (...a) => warnings.push(a.join(" "));
  try {
    assert.strictEqual(at(event(';TZID="(UTC+05:30) Chennai":20261030T150000'), "2026-10-30T08:00:00Z"), undefined);
    assert.match(warnings[0], /Chennai/);
  } finally { console.warn = warn; }
}));
test("a colon in a plain value is part of the value", () => {
  const ics = "BEGIN:VEVENT\nDTSTART:20261030T100000Z\nSUMMARY:Meet: 10am\nEND:VEVENT";
  assert.strictEqual(nextEvent(ics, new Date("2026-10-30T08:00:00Z")).title, "Meet: 10am");
});
