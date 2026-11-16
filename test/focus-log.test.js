const test = require("node:test");
const assert = require("node:assert");
const f = require("../src/focus-log");

const day = (y, m, d) => new Date(y, m - 1, d, 12);

test("focus: minutes and rounds add up per day", () => {
  let log = f.add(null, 25, true, day(2026, 11, 16));
  log = f.add(log, 25, true, day(2026, 11, 16));
  log = f.add(log, 7, false, day(2026, 11, 16));
  assert.deepStrictEqual(f.stats(log, day(2026, 11, 16)), { min: 57, rounds: 2, streak: 1 });
});

test("focus: the streak counts days in a row and allows today to be empty so far", () => {
  let log = null;
  for (const d of [13, 14, 15]) log = f.add(log, 25, true, day(2026, 11, d));
  assert.strictEqual(f.streak(log, day(2026, 11, 15)), 3);
  assert.strictEqual(f.streak(log, day(2026, 11, 16)), 3);
  assert.strictEqual(f.streak(log, day(2026, 11, 17)), 0);
  assert.strictEqual(f.streak(f.add(log, 5, false, day(2026, 11, 16)), day(2026, 11, 16)), 3, "minutes without a round don't extend it");
});

test("focus: old days are dropped and junk in the file is ignored", () => {
  const log = f.add({ days: { "2026-01-01": { min: 25, rounds: 1 }, bad: { min: 5, rounds: 1 }, "2026-11-15": { min: -3, rounds: 1 } } }, 25, true, day(2026, 11, 16));
  assert.deepStrictEqual(Object.keys(log.days), ["2026-11-16"]);
  assert.deepStrictEqual(f.clean("nope"), { days: {} });
});

test("focus: summary and stats lines read naturally", () => {
  assert.strictEqual(f.summary({ rounds: 0, min: 0 }), null);
  assert.strictEqual(f.summary({ rounds: 0, min: 3 }), "3 min focused.");
  assert.strictEqual(f.summary({ rounds: 1, min: 25 }), "1 round, 25 min focused.");
  assert.strictEqual(f.summary({ rounds: 4, min: 100 }), "4 rounds, 1 h 40 min focused.");
  assert.strictEqual(f.statsLine({ min: 0, rounds: 0, streak: 0 }), "No focus time yet today");
  assert.strictEqual(f.statsLine({ min: 120, rounds: 4, streak: 3 }), "Today 2 h · 4 rounds · 3-day streak");
  assert.ok(f.breakTip(1) && f.breakTip(9));
});
