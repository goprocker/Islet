// Next calendar event from a private iCal (.ics) link (Google / Outlook "secret address").
// Handles single events and DAILY / WEEKLY repeats (INTERVAL, COUNT, UNTIL, BYDAY, WKST);
// skips all-day events and doesn't guess other repeat rules: anything else in a rule, like
// BYMONTH, leaves just the first date rather than inventing more. Times follow their TZID; an
// event in a zone that can't be identified is skipped with a warning rather than shown at
// a wrong time.
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
// Outlook writes Windows zone names ("India Standard Time"), listed here without that suffix
const WINDOWS_ZONES = {
  "Dateline": "Etc/GMT+12", "UTC-11": "Etc/GMT+11", "Aleutian": "America/Adak", "Hawaiian": "Pacific/Honolulu", "Marquesas": "Pacific/Marquesas",
  "Alaskan": "America/Anchorage", "UTC-09": "Etc/GMT+9", "Pacific (Mexico)": "America/Tijuana", "UTC-08": "Etc/GMT+8", "Pacific": "America/Los_Angeles",
  "US Mountain": "America/Phoenix", "Mountain (Mexico)": "America/Mazatlan", "Mountain": "America/Denver", "Yukon": "America/Whitehorse", "Central America": "America/Guatemala",
  "Central": "America/Chicago", "Easter Island": "Pacific/Easter", "Central (Mexico)": "America/Mexico_City", "Canada Central": "America/Regina", "SA Pacific": "America/Bogota",
  "Eastern (Mexico)": "America/Cancun", "Eastern": "America/New_York", "Haiti": "America/Port-au-Prince", "Cuba": "America/Havana", "US Eastern": "America/Indianapolis",
  "Turks And Caicos": "America/Grand_Turk", "Paraguay": "America/Asuncion", "Atlantic": "America/Halifax", "Venezuela": "America/Caracas", "Central Brazilian": "America/Cuiaba",
  "SA Western": "America/La_Paz", "Pacific SA": "America/Santiago", "Newfoundland": "America/St_Johns", "Tocantins": "America/Araguaina", "E. South America": "America/Sao_Paulo",
  "SA Eastern": "America/Cayenne", "Argentina": "America/Buenos_Aires", "Greenland": "America/Godthab", "Montevideo": "America/Montevideo", "Magallanes": "America/Punta_Arenas",
  "Saint Pierre": "America/Miquelon", "Bahia": "America/Bahia", "UTC-02": "Etc/GMT+2", "Azores": "Atlantic/Azores", "Cape Verde": "Atlantic/Cape_Verde",
  "GMT": "Europe/London", "Greenwich": "Atlantic/Reykjavik", "Sao Tome": "Africa/Sao_Tome", "Morocco": "Africa/Casablanca", "W. Europe": "Europe/Berlin",
  "Central Europe": "Europe/Budapest", "Romance": "Europe/Paris", "Central European": "Europe/Warsaw", "W. Central Africa": "Africa/Lagos", "Jordan": "Asia/Amman",
  "GTB": "Europe/Bucharest", "Middle East": "Asia/Beirut", "Egypt": "Africa/Cairo", "E. Europe": "Europe/Chisinau", "Syria": "Asia/Damascus",
  "West Bank": "Asia/Hebron", "South Africa": "Africa/Johannesburg", "FLE": "Europe/Kiev", "Israel": "Asia/Jerusalem", "South Sudan": "Africa/Juba",
  "Kaliningrad": "Europe/Kaliningrad", "Sudan": "Africa/Khartoum", "Libya": "Africa/Tripoli", "Namibia": "Africa/Windhoek", "Arabic": "Asia/Baghdad",
  "Turkey": "Europe/Istanbul", "Arab": "Asia/Riyadh", "Belarus": "Europe/Minsk", "Russian": "Europe/Moscow", "E. Africa": "Africa/Nairobi",
  "Volgograd": "Europe/Volgograd", "Iran": "Asia/Tehran", "Arabian": "Asia/Dubai", "Astrakhan": "Europe/Astrakhan", "Azerbaijan": "Asia/Baku",
  "Russia Time Zone 3": "Europe/Samara", "Mauritius": "Indian/Mauritius", "Saratov": "Europe/Saratov", "Georgian": "Asia/Tbilisi", "Caucasus": "Asia/Yerevan",
  "Afghanistan": "Asia/Kabul", "West Asia": "Asia/Tashkent", "Ekaterinburg": "Asia/Yekaterinburg", "Pakistan": "Asia/Karachi", "Qyzylorda": "Asia/Qyzylorda",
  "India": "Asia/Kolkata", "Sri Lanka": "Asia/Colombo", "Nepal": "Asia/Kathmandu", "Central Asia": "Asia/Almaty", "Bangladesh": "Asia/Dhaka",
  "Omsk": "Asia/Omsk", "Myanmar": "Asia/Yangon", "SE Asia": "Asia/Bangkok", "Altai": "Asia/Barnaul", "W. Mongolia": "Asia/Hovd",
  "North Asia": "Asia/Krasnoyarsk", "N. Central Asia": "Asia/Novosibirsk", "Tomsk": "Asia/Tomsk", "China": "Asia/Shanghai", "North Asia East": "Asia/Irkutsk",
  "Singapore": "Asia/Singapore", "W. Australia": "Australia/Perth", "Taipei": "Asia/Taipei", "Ulaanbaatar": "Asia/Ulaanbaatar", "Aus Central W.": "Australia/Eucla",
  "Transbaikal": "Asia/Chita", "Tokyo": "Asia/Tokyo", "North Korea": "Asia/Pyongyang", "Korea": "Asia/Seoul", "Yakutsk": "Asia/Yakutsk",
  "Cen. Australia": "Australia/Adelaide", "AUS Central": "Australia/Darwin", "E. Australia": "Australia/Brisbane", "AUS Eastern": "Australia/Sydney", "West Pacific": "Pacific/Port_Moresby",
  "Tasmania": "Australia/Hobart", "Vladivostok": "Asia/Vladivostok", "Lord Howe": "Australia/Lord_Howe", "Bougainville": "Pacific/Bougainville", "Russia Time Zone 10": "Asia/Srednekolymsk",
  "Magadan": "Asia/Magadan", "Norfolk": "Pacific/Norfolk", "Sakhalin": "Asia/Sakhalin", "Central Pacific": "Pacific/Guadalcanal", "Russia Time Zone 11": "Asia/Kamchatka",
  "New Zealand": "Pacific/Auckland", "UTC+12": "Etc/GMT-12", "Fiji": "Pacific/Fiji", "Chatham Islands": "Pacific/Chatham", "UTC+13": "Etc/GMT-13",
  "Tonga": "Pacific/Tongatapu", "Samoa": "Pacific/Apia", "Line Islands": "Pacific/Kiritimati",
};
// the zone's real name: a Windows name, an IANA name, or an IANA name after a vendor prefix
// ("/mozilla.org/20050126_1/America/New_York")
function zoneId(tzid) {
  const windows = WINDOWS_ZONES[tzid.replace(/ Standard Time$/, "")];
  if (windows) return windows;
  return tzid.match(/\/((?:Africa|America|Antarctica|Asia|Atlantic|Australia|Etc|Europe|Indian|Pacific)\/.+)$/)?.[1] || tzid;
}
const zones = new Map(), warned = new Set();
// the basis for a TZID, or null when the zone isn't known
function zoneBasis(tzid) {
  if (zones.has(tzid)) return zones.get(tzid);
  let basis = null;
  try {
    const format = new Intl.DateTimeFormat("en-US", { timeZone: zoneId(tzid), hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    const wallAt = ms => {
      const p = Object.fromEntries(format.formatToParts(ms).map(x => [x.type, Number(x.value)]));
      return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    };
    const offset = ms => wallAt(ms) - ms;
    basis = {
      // a clock reading can happen twice when clocks go back: the first one counts. One
      // skipped when they go forward is read with the earlier offset, as RFC 5545 says.
      instant(wall) {
        const before = wall - offset(wall - DAY), after = wall - offset(wall + DAY);
        const real = [before, after].filter(t => wallAt(t) === wall);
        return new Date(real.length ? Math.min(...real) : before);
      },
    };
  } catch {
    if (!warned.has(tzid)) { warned.add(tzid); console.warn(`calendar: unknown time zone "${tzid}", skipping its events`); }
  }
  zones.set(tzid, basis);
  return basis;
}
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
  const quoted = prop.match(/;TZID=(?:"([^"]+)"|([^;:]+))/i);
  const tzid = quoted?.[1] || quoted?.[2];
  if (!tzid || /Z$/.test(value)) return readTime(value, LOCAL);
  const basis = zoneBasis(tzid);
  return basis ? readTime(value, basis) : null;
}

const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const RULE_PARTS = new Set(["FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "WKST"]);
// a rule this file follows exactly; "1MO" (first Monday) only means something to rules it doesn't
const supported = rule => (rule.FREQ === "DAILY" || rule.FREQ === "WEEKLY")
  && Object.keys(rule).every(k => RULE_PARTS.has(k))
  && (!rule.BYDAY || rule.BYDAY.split(",").every(d => DAYS.includes(d)));
// First occurrence of a repeating event at or after `now`, or null. Walks day by day from
// DTSTART (the first occurrence) so COUNT is counted from the real start.
function nextOccurrence(first, rr, now) {
  const start = first.at;
  const rule = Object.fromEntries(rr.split(";").map(p => p.split("=")));
  if (!supported(rule)) return start >= now ? start : null; // unsupported: first date only
  const interval = Math.max(1, Number(rule.INTERVAL) || 1);
  const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
  const until = rule.UNTIL ? readTime(rule.UNTIL.length === 8 ? rule.UNTIL + "T235959" : rule.UNTIL, first.basis)?.at : null;
  const byday = rule.BYDAY ? new Set(rule.BYDAY.split(",").map(d => DAYS.indexOf(d))) : null;
  const weekday = d => new Date(first.wall + d * DAY).getUTCDay(); // of the day `d` days after DTSTART
  const days = byday || (rule.FREQ === "WEEKLY" ? new Set([weekday(0)]) : null);
  // with INTERVAL, which weeks count depends on where a week starts: Monday unless WKST says
  const weekStart = DAYS.includes(rule.WKST) ? DAYS.indexOf(rule.WKST) : 1;
  const sinceWeekStart = (weekday(0) - weekStart + 7) % 7;
  const unitOf = d => (rule.FREQ === "DAILY" ? d : Math.floor((d + sinceWeekStart) / 7));
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
  // a quoted parameter value may contain ":"
  return [...body.matchAll(new RegExp(`^${name}((?:;(?:"[^"\\n]*"|[^:"\\n])*)?):(.*)$`, "gm"))].map(m => ({ prop: m[1], value: m[2].trim() }));
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
