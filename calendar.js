// Next calendar event from a private iCal (.ics) link (Google / Outlook "secret address").
// Handles single events and simple weekly/daily repeats; skips all-day events.
let timer = null;

function unfold(ics) { return ics.replace(/\r?\n[ \t]/g, ""); }

function parseDate(prop, value) {
  if (/VALUE=DATE(?!-)/.test(prop) || /^\d{8}$/.test(value)) return null; // all-day
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m.map((v, i) => (i && i < 7 ? Number(v) : v));
  // TZID times are treated as this PC's local time (fine when the calendar is in your own zone)
  return z ? new Date(Date.UTC(y, mo - 1, d, h, mi, s)) : new Date(y, mo - 1, d, h, mi, s);
}

function nextEvent(ics, now = new Date()) {
  let best = null;
  for (const block of unfold(ics).split("BEGIN:VEVENT").slice(1)) {
    const body = block.split("END:VEVENT")[0];
    const get = name => {
      const m = body.match(new RegExp(`^${name}([^:\\n]*):(.*)$`, "m"));
      return m ? { prop: m[1], value: m[2].trim() } : null;
    };
    const ds = get("DTSTART");
    if (!ds) continue;
    let start = parseDate(ds.prop, ds.value);
    if (!start) continue;
    const rr = get("RRULE")?.value || "";
    const freq = rr.match(/FREQ=(DAILY|WEEKLY)/)?.[1];
    const until = rr.match(/UNTIL=(\d{8}T?\d{0,6}Z?)/)?.[1];
    const untilDate = until ? parseDate("", until.length === 8 ? until + "T235959" : until) : null;
    if (freq && start < now) {
      const step = (freq === "DAILY" ? 1 : 7) * 864e5 * Number(rr.match(/INTERVAL=(\d+)/)?.[1] || 1);
      start = new Date(start.getTime() + Math.ceil((now - start) / step) * step);
      if (untilDate && start > untilDate) continue;
    }
    if (start < now) continue;
    const summary = (get("SUMMARY")?.value || "Event").replace(/\\,/g, ",").replace(/\\n/g, " ");
    if (!best || start < best.start) best = { title: summary, start };
  }
  return best && best.start - now < 24 * 3600e3 ? { title: best.title, start: best.start.getTime() } : null;
}

function poll(url, onEvent) {
  clearInterval(timer);
  if (!url) return onEvent(null);
  const run = async () => {
    try {
      const r = await fetch(url);
      if (r.ok) onEvent(nextEvent(await r.text()));
    } catch (e) { console.warn("calendar", e.message); }
  };
  run();
  timer = setInterval(run, 5 * 60 * 1000);
}

module.exports = { poll, nextEvent };
