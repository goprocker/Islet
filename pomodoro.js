// Pomodoro cycle: 25 min focus, 5 min break, a 15 min break after every 4th focus.
const FOCUS = 25, SHORT = 5, LONG = 15, ROUNDS = 4;

// the phase that follows `cur` ({ phase, round }); no `cur` starts round 1 of focus
function next(cur) {
  if (!cur) return { phase: "focus", round: 1, min: FOCUS, label: "Focus 1/4" };
  if (cur.phase === "focus") {
    const long = cur.round % ROUNDS === 0;
    return { phase: "break", round: cur.round, min: long ? LONG : SHORT, label: long ? "Long break" : "Break" };
  }
  const round = cur.round % ROUNDS + 1;
  return { phase: "focus", round, min: FOCUS, label: `Focus ${round}/${ROUNDS}` };
}

// Do Not Disturb follows the focus phase, when the setting is on
const wantsDnd = (cur, enabled) => !!enabled && !!cur && cur.phase === "focus";

module.exports = { next, wantsDnd, FOCUS, SHORT, LONG, ROUNDS };
