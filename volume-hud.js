// Turns the readings from volume-hud.ps1 into HUD events.
// A reading is {vol 0..1, mute, mic: muted|null, bright 0..100|null}.
function parse(line) {
  let r;
  try { r = JSON.parse(line); } catch { return null; }
  if (!r || typeof r.vol !== "number" || !Number.isFinite(r.vol)) return null;
  const bright = typeof r.bright === "number" && Number.isFinite(r.bright) ? Math.min(100, Math.max(0, r.bright)) : null;
  return { vol: Math.min(1, Math.max(0, r.vol)), mute: !!r.mute, mic: typeof r.mic === "boolean" ? r.mic : null, bright };
}

// what the HUD should show for a new reading, or null when nothing the user did changed.
// The first reading only sets the baseline, so starting Islet doesn't flash a HUD.
function change(prev, next) {
  if (!prev || !next) return null;
  if (next.mute !== prev.mute) return { kind: "mute", level: next.vol, muted: next.mute };
  if (next.mic !== null && prev.mic !== null && next.mic !== prev.mic) return { kind: "mic", level: 0, muted: next.mic };
  if (Math.abs(next.vol - prev.vol) >= 0.005) return { kind: "volume", level: next.vol, muted: next.mute };
  if (next.bright !== null && prev.bright !== null && next.bright !== prev.bright) return { kind: "brightness", level: next.bright / 100, muted: false };
  return null;
}

module.exports = { parse, change };
