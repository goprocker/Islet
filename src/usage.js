// How full a Claude Code session's context window is, from the newest assistant entry of its
// transcript (entries are newest first). The last turn's prompt size is the context in use:
// fresh input + cache reads + cache writes.
function contextOf(entries) {
  for (const e of entries || []) {
    const u = e?.type === "assistant" && e.message?.usage;
    if (!u) continue;
    const num = v => (Number.isFinite(v) ? v : 0);
    const tokens = num(u.input_tokens) + num(u.cache_read_input_tokens) + num(u.cache_creation_input_tokens);
    if (!tokens) continue;
    const model = String(e.message.model || "");
    // a transcript doesn't say which window the session has; past 200k it can only be the 1M one
    const limit = tokens > 200000 || /1m/i.test(model) ? 1000000 : 200000;
    return { tokens, limit, pct: Math.min(100, Math.round((tokens / limit) * 100)), model };
  }
  return null;
}
function short(n) { return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n); }
// Codex writes its plan limits into every session log (token_count events): the newest wins.
// Windows are matched by length: 300 min is the 5-hour limit, 10080 min the weekly one.
function codexLimits(text) {
  const lines = String(text || "").split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"rate_limits"')) continue;
    let rl;
    try { const e = JSON.parse(lines[i]); rl = e.payload?.rate_limits || e.payload?.info?.rate_limits || e.rate_limits; } catch { continue; }
    if (!rl) continue;
    const out = {};
    for (const w of [rl.primary, rl.secondary]) {
      if (!w || !Number.isFinite(w.used_percent)) continue;
      const key = w.window_minutes <= 300 ? "session" : "week";
      out[key] = { pct: Math.min(100, Math.round(w.used_percent)), resetsAt: Number.isFinite(w.resets_at) ? w.resets_at * 1000 : null };
    }
    let at = null;
    try { at = Date.parse(JSON.parse(lines[i]).timestamp) || null; } catch {}
    return Object.keys(out).length ? { ...out, at } : null;
  }
  return null;
}
// Every billed Claude turn in a transcript: { id, t, tokens }. A reply is logged once per content
// block with the same usage, so callers dedupe by id. Cache reads are left out: they cost little.
function claudeTurns(text) {
  const out = [];
  for (const line of String(text || "").split("\n")) {
    if (!line.includes('"usage"')) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    const u = e?.type === "assistant" && e.message?.usage;
    if (!u) continue;
    const num = v => (Number.isFinite(v) ? v : 0);
    const tokens = num(u.input_tokens) + num(u.cache_creation_input_tokens) + num(u.output_tokens);
    const t = Date.parse(e.timestamp);
    if (tokens && t) out.push({ id: e.message.id || e.uuid, t, tokens });
  }
  return out;
}
// Totals over the 5-hour and 7-day windows the plans count against.
function tally(turns, now = Date.now()) {
  const seen = new Set(), r = { session: { tokens: 0, turns: 0 }, week: { tokens: 0, turns: 0 } };
  for (const x of turns) {
    if (seen.has(x.id)) continue;
    seen.add(x.id);
    const age = now - x.t;
    if (age < 0 || age > 7 * 864e5) continue;
    r.week.tokens += x.tokens; r.week.turns++;
    if (age <= 5 * 36e5) { r.session.tokens += x.tokens; r.session.turns++; }
  }
  return r;
}
// Claude plan limits from Anthropic's usage endpoint (the numbers Claude Code's /usage shows).
function claudeLimits(j) {
  const w = x => (x && Number.isFinite(x.utilization) ? { pct: Math.min(100, Math.round(x.utilization)), resetsAt: Date.parse(x.resets_at) || null } : null);
  const out = { session: w(j?.five_hour), week: w(j?.seven_day) };
  return out.session || out.week ? out : null;
}
module.exports = { contextOf, short, codexLimits, claudeTurns, tally, claudeLimits };
