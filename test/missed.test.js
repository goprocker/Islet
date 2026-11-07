const test = require("node:test");
const assert = require("node:assert");
const { missedLog } = require("../missed");

test("nothing held back: no summary", () => {
  assert.strictEqual(missedLog().take(), null);
});
test("counts per app, busiest first, and starts again after take()", () => {
  const m = missedLog();
  for (const a of ["Teams", "WhatsApp", "WhatsApp", "Outlook", "Slack"]) m.add(a);
  assert.deepStrictEqual(m.take(), { count: 5, apps: ["WhatsApp", "Teams", "Outlook"], text: "5 notifications from WhatsApp, Teams, Outlook and 1 more" });
  assert.strictEqual(m.take(), null);
});
test("one notification reads in the singular; no app name still counts", () => {
  const m = missedLog();
  m.add("");
  assert.strictEqual(m.take().text, "1 notification from An app");
});
