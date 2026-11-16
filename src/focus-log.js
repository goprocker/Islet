// Focus Mode 2.0 (#226): minutes focused per day, a streak, break tips and a session summary.
// The log is { days: { "YYYY-MM-DD": { min, rounds } } }, kept for 60 days in userData/focus.json.
const KEEP_DAYS = 60;

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function clean(log) {
  const days = {};
  if (log && typeof log.days === "object" && log.days) for (const [k, v] of Object.entries(log.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !v) continue;
    const min = Number(v.min), rounds = Number(v.rounds);
    if (Number.isFinite(min) && min >= 0 && Number.isFinite(rounds) && rounds >= 0) days[k] = { min: Math.round(min), rounds: Math.floor(rounds) };
  }
  return { days };
}

// add focused minutes (and a finished round) to a day; drops days older than KEEP_DAYS
function add(log, minutes, round, d = new Date()) {
  const out = clean(log), k = dayKey(d);
  const cur = out.days[k] || { min: 0, rounds: 0 };
  out.days[k] = { min: cur.min + Math.max(0, Math.round(minutes)), rounds: cur.rounds + (round ? 1 : 0) };
  const oldest = dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - KEEP_DAYS));
  for (const key of Object.keys(out.days)) if (key < oldest) delete out.days[key];
  return out;
}

// days in a row, ending today (or yesterday, if today has nothing yet), with at least one finished round
function streak(log, d = new Date()) {
  const days = clean(log).days;
  let n = 0, day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (!(days[dayKey(day)]?.rounds > 0)) day.setDate(day.getDate() - 1);
  while (days[dayKey(day)]?.rounds > 0) { n++; day.setDate(day.getDate() - 1); }
  return n;
}

function stats(log, d = new Date()) {
  const t = clean(log).days[dayKey(d)] || { min: 0, rounds: 0 };
  return { min: t.min, rounds: t.rounds, streak: streak(log, d) };
}

const mins = m => m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim() : `${m} min`;

const TIPS = ["Stand up and stretch.", "Look at something far away for a bit.", "Get some water.", "Roll your shoulders and breathe out slowly.", "Step away from the screen."];
const breakTip = round => TIPS[(Math.max(1, round) - 1) % TIPS.length];

// one line for the end of a session; null when nothing was focused
function summary(session) {
  if (!session || (!session.rounds && session.min < 1)) return null;
  if (!session.rounds) return `${mins(session.min)} focused.`;
  const r = session.rounds === 1 ? "1 round" : `${session.rounds} rounds`;
  return `${r}, ${mins(session.min)} focused.`;
}

const statsLine = s => !s.min ? "No focus time yet today" : `Today ${mins(s.min)}${s.rounds ? ` · ${s.rounds === 1 ? "1 round" : `${s.rounds} rounds`}` : ""}${s.streak > 1 ? ` · ${s.streak}-day streak` : ""}`;

module.exports = { dayKey, clean, add, streak, stats, breakTip, summary, statsLine, mins };
