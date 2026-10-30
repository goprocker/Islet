// Next calendar event from a private iCal (.ics) link (Google / Outlook "secret address").
// Handles single events and DAILY / WEEKLY repeats (INTERVAL, COUNT, UNTIL, BYDAY);
// skips all-day events and doesn't guess other repeat rules.
let timer = null, generation = 0; // each poll() call starts a new generation

function unfold(ics) { return ics.replace(/\r?\n[ \t]/g, ""); }

const DAY = 864e5;
// A "wall" time is a date and clock reading, held as the ms of that same reading in UTC, so
// date arithmetic on it never meets a daylight-saving jump. A basis turns one into a real
// moment: repeats of a UTC event stay on UTC, a local one keeps its local time of day.
const UTC = { instant: wall => new Date(wall) };
const LOCAL = {
  instant(wall) {
    const d = new Date(wall);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
  },
};
// { wall, basis, at } or null; a trailing Z always means UTC, otherwise `basis` applies
function readTime(value, basis) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m.map((v, i) => (i && i < 7 ? Number(v) : v));
  const wall = Date.UTC(y, mo - 1, d, h, mi, s), used = z ? UTC : basis;
  return { wall, basis: used, at: used.instant(wall) };
}
function parseTime(prop, value) {
  if (/VALUE=DATE(?!-)/.test(prop) || /^\d{8}$/.test(value)) return null; // all-day
  // TZID times are treated as this PC's local time (fine when the calendar is in your own zone)
  return readTime(value, LOCAL);
}

const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
// First occurrence of a repeating event at or after `now`, or null. Walks day by day from
// DTSTART (the first occurrence) so COUNT is counted from the real start.
function nextOccurrence(first, rr, now) {
  const start = first.at;
  const rule = Object.fromEntries(rr.split(";").map(p => p.split("=")));
  if (rule.FREQ !== "DAILY" && rule.FREQ !== "WEEKLY") return start >= now ? start : null; // unsupported: first date only
  const interval = Math.max(1, Number(rule.INTERVAL) || 1);
  const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
  const until = rule.UNTIL ? readTime(rule.UNTIL.length === 8 ? rule.UNTIL + "T235959" : rule.UNTIL, first.basis)?.at : null;
  const byday = rule.BYDAY ? new Set(rule.BYDAY.split(",").map(d => DAYS.indexOf(d.slice(-2)))) : null;
  const weekday = d => new Date(first.wall + d * DAY).getUTCDay(); // of the day `d` days after DTSTART
  const days = byday || (rule.FREQ === "WEEKLY" ? new Set([weekday(0)]) : null);
  const sinceMonday = (weekday(0) + 6) % 7;
  const unitOf = d => (rule.FREQ === "DAILY" ? d : Math.floor((d + sinceMonday) / 7));
  const horizon = now.getTime() + 2 * 864e5;
  // the pattern repeats every `period` days from DTSTART, with the same number of
  // occurrences each time: skip whole periods up to about now instead of walking
  // there, and count what was skipped so COUNT still holds. Works for any age.
  const period = rule.FREQ === "DAILY" && !days ? interval : interval * 7;
  let perPeriod = 0;
  for (let d = 0; d < period; d++) {
    if (!(unitOf(d) % interval) && (!days || days.has(weekday(d)))) perPeriod++;
  }
  const skip = Math.max(0, Math.floor((now - start) / DAY / period) - 1); // one spare for DST
  const from = skip * period;
  let seen = skip * perPeriod;
  for (let d = from; d < from + 3 * period + 4; d++) {
    const day = first.basis.instant(first.wall + d * DAY); // keeps the time of day in its basis
    if (day.getTime() > horizon || (until && day > until)) return null;
    if (unitOf(d) % interval || (days && !days.has(weekday(d)))) continue;
    if (++seen > count) return null;
    if (day >= now) return day;
  }
  return null;
}

// every "NAME;params:value" line of one VEVENT, as { prop, value }
function props(body, name) {
  return [...body.matchAll(new RegExp(`^${name}([;:][^:\\n]*)?:(.*)$`, "gm"))].map(m => ({ prop: m[1] || "", value: m[2].trim() }));
}
// all times listed on EXDATE / RECURRENCE-ID lines (comma-separated values allowed)
function times(list) {
  return list.flatMap(p => p.value.split(",").map(v => parseTime(p.prop, v.trim())?.at.getTime())).filter(Number.isFinite);
}

function nextEvent(ics, now = new Date()) {
  const events = unfold(ics).split("BEGIN:VEVENT").slice(1).map(block => {
    const body = block.split("END:VEVENT")[0];
    const get = name => props(body, name)[0] || null;
    return { body, get, uid: get("UID")?.value || "", rid: times(props(body, "RECURRENCE-ID"))[0] };
  });
  // a series' single changed or cancelled dates come as their own VEVENT with the same UID
  // and a RECURRENCE-ID: the series skips those dates, the override stands on its own
  const overridden = new Map();
  for (const e of events) if (e.uid && e.rid !== undefined) (overridden.get(e.uid) || overridden.set(e.uid, new Set()).get(e.uid)).add(e.rid);
  let best = null;
  for (const { body, get, uid, rid } of events) {
    if (/^CANCELLED$/i.test(get("STATUS")?.value || "")) continue;
    const ds = get("DTSTART");
    if (!ds) continue;
    const first = parseTime(ds.prop, ds.value);
    if (!first) continue;
    let start = first.at;
    const rr = rid === undefined ? get("RRULE")?.value || "" : ""; // an override is one date
    if (rr) {
      const skip = new Set([...times(props(body, "EXDATE")), ...(overridden.get(uid) || [])]);
      let from = now;
      for (let i = 0; i < 100; i++) {
        start = nextOccurrence(first, rr, from);
        if (!start || !skip.has(start.getTime())) break;
        from = new Date(start.getTime() + 1);
      }
      if (!start || skip.has(start.getTime())) continue;
    }
    if (start < now) continue;
    const summary = (get("SUMMARY")?.value || "Event").replace(/\\,/g, ",").replace(/\\n/g, " ");
    if (!best || start < best.start) best = { title: summary, start };
  }
  return best && best.start - now < 24 * 3600e3 ? { title: best.title, start: best.start.getTime() } : null;
}

function poll(url, onEvent) {
  clearInterval(timer);
  const gen = ++generation; // replies from an older poll() are dropped
  if (!url) return onEvent(null);
  const run = async () => {
    try {
      const r = await fetch(url);
      const text = r.ok ? await r.text() : null;
      if (gen === generation && text !== null) onEvent(nextEvent(text));
    } catch (e) { console.warn("calendar", e.message); }
  };
  run();
  timer = setInterval(run, 5 * 60 * 1000);
}

module.exports = { poll, nextEvent };
