const test = require("node:test");
const assert = require("node:assert");
const { nextEvent, meetingLink, isMeetingUrl } = require("../src/calendar");

const now = new Date("2026-11-03T09:00:00Z");
const event = fields => `BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20261103T093000Z\nSUMMARY:Standup\n${fields}\nEND:VEVENT\nEND:VCALENDAR`;

test("finds Zoom, Meet, Teams and Webex links", () => {
  assert.strictEqual(meetingLink("Join https://us02web.zoom.us/j/123456789?pwd=abc please"), "https://us02web.zoom.us/j/123456789?pwd=abc");
  assert.strictEqual(meetingLink("https://meet.google.com/abc-defg-hij"), "https://meet.google.com/abc-defg-hij");
  assert.strictEqual(meetingLink("<https://teams.microsoft.com/l/meetup-join/19%3ameeting_x>"), "https://teams.microsoft.com/l/meetup-join/19%3ameeting_x");
  assert.strictEqual(meetingLink("https://acme.webex.com/meet/room"), "https://acme.webex.com/meet/room");
});

test("trailing punctuation and ICS escapes are not part of the link", () => {
  assert.strictEqual(meetingLink("Link: https://meet.google.com/abc-defg-hij."), "https://meet.google.com/abc-defg-hij");
  assert.strictEqual(meetingLink("Agenda\nhttps://zoom.us/j/1\, see you"), "https://zoom.us/j/1");
});

test("only https links to the known services are ever accepted", () => {
  assert.strictEqual(meetingLink("http://zoom.us/j/1"), null);
  assert.strictEqual(meetingLink("https://evil.example/zoom.us/j/1"), null);
  assert.strictEqual(meetingLink("https://zoom.us.evil.example/j/1"), null);
  assert.strictEqual(meetingLink("https://notzoom.us/j/1"), null);
  assert.strictEqual(meetingLink("https://user:pw@zoom.us/j/1"), null);
  assert.strictEqual(isMeetingUrl("file:///C:/Windows/System32/calc.exe"), false);
  assert.strictEqual(isMeetingUrl("javascript:alert(1)"), false);
  assert.strictEqual(isMeetingUrl(null), false);
  assert.strictEqual(meetingLink(""), null);
  assert.strictEqual(meetingLink(undefined), null);
});

test("skips a normal website and takes the later meeting link", () => {
  assert.strictEqual(meetingLink("Notes https://docs.example.com/a and https://meet.google.com/xyz-abcd-efg"), "https://meet.google.com/xyz-abcd-efg");
});

test("the next event carries its meeting link, found in the location or the description", () => {
  assert.strictEqual(nextEvent(event("LOCATION:https://meet.google.com/abc-defg-hij"), now).link, "https://meet.google.com/abc-defg-hij");
  assert.strictEqual(nextEvent(event("DESCRIPTION:Join: https://zoom.us/j/42\nBring notes"), now).link, "https://zoom.us/j/42");
  assert.strictEqual(nextEvent(event("X-GOOGLE-CONFERENCE:https://meet.google.com/aaa-bbbb-ccc"), now).link, "https://meet.google.com/aaa-bbbb-ccc");
});

test("an event without a meeting link has no link property", () => {
  const e = nextEvent(event("LOCATION:Room 4"), now);
  assert.deepStrictEqual(e, { title: "Standup", start: Date.parse("2026-11-03T09:30:00Z") });
});

test("a folded description line still gives the link", () => {
  assert.strictEqual(nextEvent(event("DESCRIPTION:Join https://meet.google.com/abc-def\n g-hij now"), now).link, "https://meet.google.com/abc-defg-hij");
});
