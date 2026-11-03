import { Easing, interpolate } from "remotion";

export const WHITE = "#f5f5f7";
export const GREY = "#86868b";
export const GOLD = "#e8c27a";
export const VIOLET = "#a58bff";
export const BLUE = "#6f9bff";
export const MIC = "#ff9f0a"; // the app's own microphone dot colour

// no overshoot anywhere: shapes settle, they never bounce
export const settle = Easing.bezier(0.32, 0.72, 0, 1);
export const glide = Easing.bezier(0.65, 0, 0.2, 1);
export const rise = Easing.bezier(0.16, 1, 0.3, 1);

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// all timing is in seconds so the film and scripts/make_score.py share cues.json
export const ramp = (s: number, from: number, to: number, easing: (t: number) => number = settle) =>
  interpolate(s, [from, to], [0, 1], { ...clamp, easing });

export const appear = (s: number, at: number, leave: number | null = null, dur = 0.25) => {
  const on = ramp(s, at, at + dur, rise);
  return leave === null ? on : on * (1 - ramp(s, leave, leave + 0.2, glide));
};

// the staggered entrance used by every piece of island content
export const reveal = (s: number, at: number, leave: number | null = null, y = 8): React.CSSProperties => {
  const o = appear(s, at, leave);
  return { opacity: o, translate: `0 ${(1 - ramp(s, at, at + 0.3, rise)) * y}px` };
};
