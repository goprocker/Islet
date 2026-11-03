import { Easing, interpolate, interpolateColors, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { BlackHole } from "./BlackHole";

type View = "dot" | "pill" | "music" | "toast" | "agents" | "power" | "open" | "word";
type State = { at: number; w: number; h: number; r: number; top: number; view: View };

const dot = { w: 44, h: 44, r: 22, top: 22, view: "dot" as const };
const pill = { w: 230, h: 50, r: 25, top: 0, view: "pill" as const };
const music = { w: 660, h: 190, r: 44, top: 0, view: "music" as const };
const toast = { w: 640, h: 140, r: 44, top: 0, view: "toast" as const };
const agents = { w: 680, h: 216, r: 44, top: 0, view: "agents" as const };
const power = { w: 520, h: 200, r: 50, top: 0, view: "power" as const };

// one element for the entire film: every scene is this pill changing shape
const STATES: State[] = [
  { at: 0, ...dot },
  { at: 35, ...dot, w: 190 },
  { at: 110, ...pill },
  { at: 210, ...music },
  { at: 390, ...toast },
  { at: 540, ...agents },
  { at: 750, ...power },
  { at: 930, ...music },
  { at: 945, ...toast },
  { at: 960, ...agents },
  { at: 975, ...power },
  { at: 990, ...music },
  { at: 1005, ...toast },
  { at: 1020, w: 920, h: 224, r: 50, top: 0, view: "open" },
  { at: 1080, ...pill },
  { at: 1110, w: 440, h: 130, r: 65, top: 65, view: "word" },
];

const WHITE = "#f5f5f7";
const GREY = "#8e8e93";
const GOLD = "#e0b53c";

// 120 BPM: a beat is 15 frames, so the wave pulses with the score
const Wave: React.FC<{ scale?: number }> = ({ scale = 1 }) => {
  const frame = useCurrentFrame();
  const beat = Math.exp(-((frame % 15) / 6));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 * scale, height: 44 * scale }}>
      {[0.55, 0.85, 1, 0.75, 0.6, 0.4].map((a, i) => (
        <div
          key={i}
          style={{
            width: 7 * scale,
            borderRadius: 4 * scale,
            background: GOLD,
            height: (8 + 34 * a * (0.25 + 0.75 * beat * Math.abs(Math.sin(frame * 0.17 + i * 1.3)))) * scale,
          }}
        />
      ))}
    </div>
  );
};

const Art: React.FC<{ size: number }> = ({ size }) => (
  <div
    style={{
      width: size,
      height: size,
      flexShrink: 0,
      borderRadius: size * 0.2,
      background: "radial-gradient(circle at 35% 30%, #f6d675, #b27c1e 55%, #4d300a)",
      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.14)",
    }}
  />
);

const Glyph: React.FC<{ d: string; size?: number }> = ({ d, size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={WHITE}>
    <path d={d} />
  </svg>
);

const Player: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [210, 1080], [0.42, 0.88], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <Art size={compact ? 72 : 84} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: WHITE, fontSize: compact ? 25 : 30, fontWeight: 600, whiteSpace: "nowrap" }}>Midnight Static</div>
          <div style={{ color: GREY, fontSize: compact ? 20 : 23, marginTop: 2 }}>Nova Arcade</div>
        </div>
        <Wave scale={compact ? 0.75 : 1} />
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "#2c2c2e", marginTop: 20 }}>
        <div style={{ height: 6, borderRadius: 3, background: GOLD, width: `${progress * 100}%` }} />
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 30, marginTop: 8 }}>
        <Glyph size={compact ? 30 : 34} d="M6 5h2v14H6zM20 5v14L9 12z" />
        <Glyph size={compact ? 30 : 34} d="M7 5h4v14H7zM13 5h4v14h-4z" />
        <Glyph size={compact ? 30 : 34} d="M16 5h2v14h-2zM4 5l11 7-11 7z" />
      </div>
    </div>
  );
};

const Toast: React.FC = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 22, width: "100%" }}>
    <div
      style={{
        width: 84,
        height: 84,
        borderRadius: 20,
        flexShrink: 0,
        background: "#30d158",
        color: "white",
        fontSize: 44,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      M
    </div>
    <div>
      <div style={{ color: WHITE, fontSize: 28, fontWeight: 600 }}>Maya</div>
      <div style={{ color: "#d1d1d6", fontSize: 25, marginTop: 3 }}>Lunch at 1? I can book the table.</div>
    </div>
  </div>
);

const Agents: React.FC = () => {
  const frame = useCurrentFrame();
  const asking = frame >= 610;
  const clicked = frame >= 685;
  const press = interpolate(frame, [680, 685, 691], [1, 0.9, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cursorX = interpolate(frame, [630, 678], [520, 70], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.22, 1, 0.36, 1) });
  const cursorY = interpolate(frame, [630, 678], [190, 142], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.22, 1, 0.36, 1) });
  const status = clicked ? "Done" : asking ? "Needs you" : "Working";
  const color = clicked ? "#30d158" : asking ? "#ff9f0a" : "#bf9eff";
  return (
    <div style={{ width: "100%", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 18, height: 18, borderRadius: 9, background: color, boxShadow: `0 0 18px ${color}` }} />
        <div style={{ color: WHITE, fontSize: 24, background: "#2c2c2e", padding: "5px 18px", borderRadius: 20 }}>islet</div>
        <div style={{ color: GREY, fontSize: 24, background: "#1c1c1e", padding: "5px 18px", borderRadius: 20 }}>api</div>
      </div>
      <div style={{ color: GREY, fontSize: 25, marginTop: 12 }}>Claude · {status}</div>
      {asking && !clicked ? (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <div style={{ color: "white", fontSize: 26, fontWeight: 600, background: "#30d158", padding: "7px 34px", borderRadius: 22, scale: press }}>Allow</div>
            <div style={{ color: WHITE, fontSize: 26, background: "#2c2c2e", padding: "7px 34px", borderRadius: 22 }}>Deny</div>
            <div style={{ color: "#d1d1d6", fontSize: 24, marginLeft: 8 }}>Run npm test</div>
          </div>
        </div>
      ) : (
        <div style={{ color: WHITE, fontSize: 28, marginTop: 8 }}>{clicked ? "Ran npm test. All passing." : "Edited notch.css, notch.js"}</div>
      )}
      {asking && !clicked ? (
        <svg width="34" height="44" viewBox="0 0 17 22" style={{ position: "absolute", left: cursorX, top: cursorY - 40 }}>
          <path d="M1 1v16l4.5-4 3 7 3-1.3-3-6.7H15z" fill="white" stroke="black" />
        </svg>
      ) : null}
    </div>
  );
};

const Power: React.FC = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
    <BlackHole startFrame={750} size={240} />
    <div>
      <div style={{ color: WHITE, fontSize: 58, fontWeight: 600, letterSpacing: -1 }}>84%</div>
      <div style={{ color: "#ffcc78", fontSize: 17, fontWeight: 600, letterSpacing: 2.5, whiteSpace: "nowrap" }}>CHARGING INITIATED</div>
    </div>
  </div>
);

const Open: React.FC = () => (
  <div style={{ display: "flex", width: "100%", gap: 24, alignItems: "stretch" }}>
    <div style={{ width: 230, flexShrink: 0, borderRight: "1px solid #2c2c2e", paddingRight: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ width: 14, height: 14, borderRadius: 7, background: "#bf9eff" }} />
        <div style={{ color: WHITE, fontSize: 20, background: "#2c2c2e", padding: "3px 13px", borderRadius: 16 }}>islet</div>
        <div style={{ color: GREY, fontSize: 20, background: "#1c1c1e", padding: "3px 13px", borderRadius: 16 }}>api</div>
      </div>
      <div style={{ color: GREY, fontSize: 19, marginTop: 10 }}>Codex · Working</div>
      <div style={{ color: WHITE, fontSize: 21, marginTop: 6 }}>Edited notch.css</div>
      <div style={{ color: GREY, fontSize: 19, marginTop: 6 }}>Ran npm test</div>
    </div>
    <Player compact />
    <div style={{ width: 140, flexShrink: 0, borderLeft: "1px solid #2c2c2e", paddingLeft: 18, whiteSpace: "nowrap" }}>
      <div style={{ color: WHITE, fontSize: 32, fontWeight: 600, whiteSpace: "nowrap" }}>7:08 PM</div>
      <div style={{ color: GREY, fontSize: 18 }}>Sat, Oct 31</div>
      <div style={{ color: WHITE, fontSize: 21, marginTop: 42 }}>30°C</div>
      <div style={{ color: GREY, fontSize: 19, marginTop: 4 }}>84% battery</div>
    </div>
  </div>
);

const ViewBody: React.FC<{ view: View }> = ({ view }) => {
  switch (view) {
    case "dot":
      return <div style={{ width: 16, height: 16, borderRadius: 8, background: "#bf9eff", boxShadow: "0 0 26px #bf9eff" }} />;
    case "pill":
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          <Art size={36} />
          <div style={{ width: 14, height: 14, borderRadius: 7, background: "#bf9eff" }} />
          <Wave scale={0.6} />
        </div>
      );
    case "music":
      return <Player />;
    case "toast":
      return <Toast />;
    case "agents":
      return <Agents />;
    case "power":
      return <Power />;
    case "open":
      return <Open />;
    case "word":
      return <div style={{ color: WHITE, fontSize: 80, fontWeight: 600, letterSpacing: -2 }}>Islet</div>;
  }
};

const ACCENTS = [
  [0, "#bf9eff"], [205, "#bf9eff"], [225, GOLD], [385, GOLD], [405, "#30d158"], [535, "#30d158"], [555, "#bf9eff"],
  [745, "#bf9eff"], [770, "#f97316"], [1010, "#f97316"], [1030, "#bf9eff"],
] as const;

export const Notch: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const prop = (k: "w" | "h" | "r" | "top") =>
    STATES.reduce(
      (value, s, i) =>
        i === 0
          ? s[k]
          : value +
            (s[k] - STATES[i - 1][k]) *
              spring({ frame: frame - s.at, fps, config: { damping: 15, stiffness: 150, mass: 0.85 } }),
      0,
    );

  const accent = interpolateColors(frame, ACCENTS.map((a) => a[0]), ACCENTS.map((a) => a[1]));
  const rim = interpolate(frame, [20, 60, 110, 150, 1090, 1125], [0, 0.34, 0.34, 0.14, 0.14, 0.3], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const breathe = 1 + 0.012 * Math.sin(frame / 12) * interpolate(frame, [80, 110], [1, 0], { extrapolateRight: "clamp" });

  return (
    <div
      style={{
        position: "absolute",
        left: 960,
        top: 0,
        translate: "-50% 0",
        scale: breathe,
        width: Math.max(1, prop("w")),
        height: Math.max(1, prop("h")),
        background: "#000",
        borderRadius: `${Math.max(0, prop("top"))}px ${Math.max(0, prop("top"))}px ${prop("r")}px ${prop("r")}px`,
        boxShadow: `0 0 0 1px rgba(255,255,255,${rim}), 0 30px 140px ${accent}55`,
        overflow: "hidden",
      }}
    >
      {STATES.map((s, i) => {
        const end = STATES[i + 1]?.at ?? 99999;
        if (frame < s.at - 1 || frame > end + 6) return null;
        const quick = i + 1 < STATES.length && end - s.at <= 15;
        const inAt = s.at + (i === 0 ? 0 : 4);
        const opacity = Math.min(
          interpolate(frame, [inAt, inAt + (quick ? 4 : 9)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          interpolate(frame, [end - 1, end + 4], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        );
        const pad = s.view === "pill" ? 16 : s.view === "dot" || s.view === "word" ? 0 : 34;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              translate: "-50% 0",
              width: s.w,
              height: s.h,
              padding: `0 ${pad}px`,
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity,
              filter: `blur(${(1 - opacity) * 10}px)`,
            }}
          >
            <ViewBody view={s.view} />
          </div>
        );
      })}
    </div>
  );
};
