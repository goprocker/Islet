const test = require("node:test");
const assert = require("node:assert");
const { contextOf, short } = require("../src/usage");
const asst = (usage, model = "claude-sonnet-5-5") => ({ type: "assistant", message: { model, usage } });

test("context is the newest assistant turn's prompt size", () => {
  const c = contextOf([{ type: "user" }, asst({ input_tokens: 10, cache_read_input_tokens: 90000, cache_creation_input_tokens: 10000, output_tokens: 5 }), asst({ input_tokens: 1 })]);
  assert.deepStrictEqual([c.tokens, c.limit, c.pct], [100010, 200000, 50]);
});
test("past 200k tokens the window must be the 1M one", () => {
  assert.strictEqual(contextOf([asst({ input_tokens: 400000 })]).pct, 40);
});
test("no usage means no meter", () => {
  assert.strictEqual(contextOf([]), null);
  assert.strictEqual(contextOf(null), null);
  assert.strictEqual(contextOf([asst({}), { type: "user" }]), null);
});
test("short token counts", () => {
  assert.deepStrictEqual([short(950), short(64000), short(1250000)], ["950", "64k", "1.3M"]);
});

const { codexLimits, claudeTurns, tally } = require("../src/usage");
test("codex limits come from the newest rate_limits line", () => {
  const line = pct => JSON.stringify({ timestamp: "2026-11-16T13:00:00Z", type: "event_msg", payload: { type: "token_count", rate_limits: { primary: { used_percent: pct, window_minutes: 300, resets_at: 1794851700 }, secondary: { used_percent: 5, window_minutes: 10080, resets_at: 1795232100 } } } });
  const l = codexLimits([line(3), line(11), "{}"].join("\n"));
  assert.deepStrictEqual([l.session.pct, l.week.pct, l.session.resetsAt], [11, 5, 1794851700000]);
  assert.strictEqual(codexLimits("nothing"), null);
});
test("claude usage dedupes replies and splits 5 h / 7 day windows", () => {
  const now = Date.parse("2026-11-18T12:00:00Z");
  const e = (id, ts, n) => JSON.stringify({ type: "assistant", timestamp: ts, message: { id, usage: { input_tokens: n, output_tokens: 0 } } });
  const turns = claudeTurns([e("a", "2026-11-18T11:00:00Z", 100), e("a", "2026-11-18T11:00:00Z", 100), e("b", "2026-11-15T11:00:00Z", 50), e("c", "2026-11-01T11:00:00Z", 999)].join("\n"));
  assert.deepStrictEqual(tally(turns, now), { session: { tokens: 100, turns: 1 }, week: { tokens: 150, turns: 2 } });
});
test("claude plan limits from the usage endpoint", () => {
  const { claudeLimits } = require("../src/usage");
  const l = claudeLimits({ five_hour: { utilization: 13.0, resets_at: "2026-11-18T18:10:00Z" }, seven_day: { utilization: 47.4 } });
  assert.deepStrictEqual([l.session.pct, l.week.pct, l.week.resetsAt], [13, 47, null]);
  assert.strictEqual(claudeLimits({}), null);
});
