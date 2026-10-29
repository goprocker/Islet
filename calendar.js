// Next calendar event from a private iCal (.ics) link (Google / Outlook "secret address").
// Handles single events and DAILY / WEEKLY repeats (INTERVAL, COUNT, UNTIL, BYDAY);
// skips all-day events and doesn't guess other repeat rules.
let timer = null, generation = 0; // each poll() call starts a new generation

function unfold(ics) { return ics.replace(/\r?\n[ \t]/g, ""); }

function parseDate(prop, value) {
  if (/VALUE=DATE(?!-)/.test(prop) || /^\d{8}$/.test(value)) return null; // all-day
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m.map((v, i) => (i && i < 7 ? Number(v) : v));
  // TZID times are treated as this PC's local time (fine when the calendar is in your own zone)
  return z ? new Date(Date.UTC(y, mo - 1, d, h, mi, s)) : new Date(y, mo - 1, d, h, mi, s);
}

const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
// First occurrence of a repeating event at or after `now`, or null. Walks day by day from
// DTSTART (the first occurrence) so COUNT is counted from the real start.
function nextOccurrence(start, rr, now) {
  const rule = Object.fromEntries(rr.split(";").map(p => p.split("=")));
  if (rule.FREQ !== "DAILY" && rule.FREQ !== "WEEKLY") return start >= now ? start : null; // unsupported: first date only
  const interval = Math.max(1, Number(rule.INTERVAL) || 1);
  const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
  const until = rule.UNTIL ? parseDate("", rule.UNTIL.length === 8 ? rule.UNTIL + "T235959" : rule.UNTIL) : null;
  const byday = rule.BYDAY ? new Set(rule.BYDAY.split(",").map(d => DAYS.indexOf(d.slice(-2)))) : null;
  const days = byday || (rule.FREQ === "WEEKLY" ? new Set([start.getDay()]) : null);
  const weekStart = new Date(start); weekStart.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday
  const horizon = now.getTime() + 2 * 864e5;
  let seen = 0;
  for (let d = 0; d < 20 * 366; d++) {
    const day = new Date(start); day.setDate(start.getDate() + d); // keeps the local time of day
    if (day.getTime() > horizon || (until && day > until)) return null;
    const unit = rule.FREQ === "DAILY" ? d : Math.floor(Math.round((day - weekStart) / 864e5) / 7);
    if (unit % interval || (days && !days.has(day.getDay()))) continue;
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
  return list.flatMap(p => p.value.split(",").map(v => parseDate(p.prop, v.trim())?.getTime())).filter(Number.isFinite);
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
    let start = parseDate(ds.prop, ds.value);
    if (!start) continue;
    const rr = rid === undefined ? get("RRULE")?.value || "" : ""; // an override is one date
    if (rr) {
      const skip = new Set([...times(props(body, "EXDATE")), ...(overridden.get(uid) || [])]);
      let from = now;
      for (let i = 0; i < 100; i++) {
        start = nextOccurrence(start, rr, from);
        if (!start || !skip.has(start.getTime())) break;
        from = new Date(start.getTime() + 1);
        start = parseDate(ds.prop, ds.value);
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
