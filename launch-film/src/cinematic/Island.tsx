import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CORE_GEOMETRY } from "./Accretion";
import cues from "./cues.json";
import eq from "./eq.json";
import { BLUE, GOLD, GREY, MIC, VIOLET, WHITE, appear, ramp, reveal, settle } from "./motion";

const MID = 430; // the island's stage centre, so scenes keep one eye line
const ZOOM = 1.3; // the feature scenes sit closer to the viewer than the final desktop
type Shape = { at: number; dur?: number; w: number; h: number; r: number; y: number };

// One element for the whole film: every scene is this shape changing. y is the shape's centre.
const SHAPES: Shape[] = [
  { at: 0, w: 216, h: 52, r: 26, y: MID },
  { at: cues.notificationOpen, w: 780, h: 152, r: 44, y: MID },
  { at: cues.chargeCollapse, w: (CORE_GEOMETRY.r * 2) / ZOOM, h: (CORE_GEOMETRY.r * 2) / ZOOM, r: CORE_GEOMETRY.r / ZOOM, y: CORE_GEOMETRY.y },
  { at: cues.chargeCompact, dur: 0.5, w: 216, h: 52, r: 26, y: MID },
  { at: cues.permissionOpen, w: 780, h: 244, r: 44, y: MID },
  { at: cues.musicDot, w: 52, h: 52, r: 26, y: MID },
  { at: cues.musicOpen, w: 760, h: 224, r: 44, y: MID },
  { at: cues.micCompact, w: 300, h: 60, r: 30, y: MID },
  { at: cues.micLabel, w: 470, h: 60, r: 30, y: MID },
  { at: cues.desktop, dur: 0.65, w: 216, h: 40, r: 20, y: 20 },
  { at: cues.finalOpen, w: 860, h: 196, r: 36, y: 98 },
  { at: cues.finalClose, w: 216, h: 40, r: 20, y: 20 },
];

const shapeAt = (s: number) =>
  SHAPES.slice(1).reduce(
    (cur, next, i) => {
      const p = ramp(s, next.at, next.at + (next.dur ?? 0.55));
      const prev = SHAPES[i];
      return {
        w: cur.w + (next.w - prev.w) * p,
        h: cur.h + (next.h - prev.h) * p,
        r: cur.r + (next.r - prev.r) * p,
        y: cur.y + (next.y - prev.y) * p,
      };
    },
    { w: SHAPES[0].w, h: SHAPES[0].h, r: SHAPES[0].r, y: SHAPES[0].y },
  );

const Equalizer: React.FC<{ s: number; size?: number; color?: string }> = ({ s, size = 1, color = WHITE }) => {
  const i = Math.max(0, Math.round((s - eq.from) * eq.fps));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 * size, height: 34 * size }}>
      {eq.bands.map((band, b) => (
        <div key={b} style={{ width: 5 * size, height: (5 + 29 * (band[i] ?? 0)) * size, borderRadius: 3 * size, background: color }} />
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
      background: "radial-gradient(circle at 34% 28%, #9fb9ff, #3f5fb8 52%, #121a3d)",
      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)",
    }}
  />
);

const Glyph: React.FC<{ d: string; size: number }> = ({ d, size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={WHITE}>
    <path d={d} />
  </svg>
);

const Layer: React.FC<{ s: number; from: number; to: number; children: React.ReactNode; padding?: string }> = ({ s, from, to, children, padding = "0 36px" }) =>
  s < from || s > to ? null : (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ flexShrink: 0, width: "100%", padding, boxSizing: "border-box" }}>{children}</div>
    </div>
  );

const Notification: React.FC<{ s: number }> = ({ s }) => {
  const at = cues.notificationOpen + 0.22, out = cues.chargeCollapse - 0.2;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24, width: 708 }}>
      <div style={{ width: 84, height: 84, borderRadius: 20, flexShrink: 0, background: "#30d158", color: "white", fontSize: 42, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", ...reveal(s, at, out) }}>
        M
      </div>
      <div>
        <div style={{ color: WHITE, fontSize: 28, fontWeight: 600, ...reveal(s, at + 0.09, out) }}>Maya</div>
        <div style={{ color: "#c7c7cc", fontSize: 26, marginTop: 4, whiteSpace: "nowrap", ...reveal(s, at + 0.18, out) }}>Lunch at 1? I can book the table.</div>
      </div>
    </div>
  );
};

const Permission: React.FC<{ s: number }> = ({ s }) => {
  const at = cues.permissionOpen + 0.2, out = cues.musicDot - 0.22, press = cues.permissionPress;
  const answered = ramp(s, press + 0.04, press + 0.24);
  const dip = 1 - 0.04 * (ramp(s, press - 0.08, press) - ramp(s, press, press + 0.16));
  const hover = ramp(s, press - 0.55, press - 0.2);
  const cursorX = interpolate(ramp(s, press - 1.5, press - 0.15), [0, 1], [720, 560]);
  const cursorY = interpolate(ramp(s, press - 1.5, press - 0.15), [0, 1], [225, 157]);
  const button: React.CSSProperties = { flex: 1, height: 60, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 600 };
  return (
    <div style={{ position: "relative", width: 708 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, ...reveal(s, at, out) }}>
        <div style={{ width: 12, height: 12, borderRadius: 6, background: VIOLET }} />
        <div style={{ color: VIOLET, fontSize: 24, fontWeight: 600 }}>Claude Code</div>
      </div>
      <div style={{ color: WHITE, fontSize: 32, fontWeight: 600, marginTop: 10, ...reveal(s, at + 0.09, out) }}>Allow Bash in islet?</div>
      <div style={{ color: GREY, fontSize: 24, marginTop: 4, ...reveal(s, at + 0.15, out) }}>npm test</div>
      <div style={{ display: "flex", gap: 14, marginTop: 20, ...reveal(s, at + 0.24, out) }}>
        <div style={{ ...button, background: "#2c2c2e", color: WHITE, opacity: 1 - answered * 0.55 }}>Deny</div>
        <div style={{ ...button, position: "relative", background: `rgba(${165 - 14 * hover},${139 + 10 * hover},255,${0.22 + 0.1 * hover + 0.5 * answered})`, color: WHITE, scale: dip }}>
          <span style={{ opacity: 1 - answered }}>Allow</span>
          <span style={{ position: "absolute", opacity: answered }}>Allowed by you</span>
        </div>
      </div>
      {/* the person's cursor makes the choice: the film never shows a decision making itself */}
      <svg width="30" height="39" viewBox="0 0 17 22" style={{ position: "absolute", left: cursorX, top: cursorY, opacity: appear(s, press - 1.5, press + 0.55) }}>
        <path d="M1 1v16l4.5-4 3 7 3-1.3-3-6.7H15z" fill="white" stroke="black" />
      </svg>
    </div>
  );
};

const Player: React.FC<{ s: number }> = ({ s }) => {
  const at = cues.musicOpen + 0.2, out = cues.micCompact - 0.2;
  const progress = interpolate(s, [cues.musicOpen, cues.micCompact], [0.42, 0.56]);
  return (
    <div style={{ width: 688 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <div style={reveal(s, at, out)}>
          <Art size={92} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: WHITE, fontSize: 30, fontWeight: 600, ...reveal(s, at + 0.09, out) }}>Midnight Static</div>
          <div style={{ color: GREY, fontSize: 24, marginTop: 2, ...reveal(s, at + 0.15, out) }}>Nova Arcade</div>
        </div>
        <div style={reveal(s, at + 0.18, out)}>
          <Equalizer s={s} />
        </div>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "#2c2c2e", marginTop: 20, overflow: "hidden", ...reveal(s, at + 0.24, out, 0) }}>
        <div style={{ height: 6, borderRadius: 3, background: WHITE, width: `${progress * 100}%` }} />
      </div>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 40, marginTop: 14, ...reveal(s, at + 0.3, out) }}>
        <Glyph size={34} d="M6 5h2v14H6zM20 5v14L9 12z" />
        <Glyph size={40} d="M7 5h4v14H7zM13 5h4v14h-4z" />
        <Glyph size={34} d="M16 5h2v14h-2zM4 5l11 7-11 7z" />
      </div>
    </div>
  );
};

const FinalOpen: React.FC<{ s: number }> = ({ s }) => {
  const at = cues.finalOpen + 0.2, out = cues.finalClose - 0.16;
  return (
    <div style={{ display: "flex", gap: 26, alignItems: "stretch", paddingTop: 16 }}>
      <div style={{ width: 208, borderRight: "1px solid #2c2c2e", paddingRight: 16, ...reveal(s, at, out) }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ width: 10, height: 10, borderRadius: 5, background: VIOLET }} />
          <div style={{ color: VIOLET, fontSize: 19, fontWeight: 600 }}>Claude</div>
        </div>
        <div style={{ color: WHITE, fontSize: 19, marginTop: 12, whiteSpace: "nowrap" }}>Edited notch.css</div>
        <div style={{ color: GREY, fontSize: 18, marginTop: 8, whiteSpace: "nowrap" }}>Working</div>
      </div>
      <div style={{ flex: 1, minWidth: 0, ...reveal(s, at + 0.08, out) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Art size={64} />
          <div style={{ flex: 1 }}>
            <div style={{ color: WHITE, fontSize: 21, fontWeight: 600, whiteSpace: "nowrap" }}>Midnight Static</div>
            <div style={{ color: GREY, fontSize: 18 }}>Nova Arcade</div>
          </div>
          <Equalizer s={s - 6} size={0.72} />
        </div>
        <div style={{ height: 4, borderRadius: 2, background: "#2c2c2e", marginTop: 16 }}>
          <div style={{ height: 4, borderRadius: 2, background: WHITE, width: "58%" }} />
        </div>
      </div>
      <div style={{ width: 132, borderLeft: "1px solid #2c2c2e", paddingLeft: 18, whiteSpace: "nowrap", ...reveal(s, at + 0.16, out) }}>
        <div style={{ color: WHITE, fontSize: 28, fontWeight: 600 }}>7:08 PM</div>
        <div style={{ color: GREY, fontSize: 17, marginTop: 2 }}>Sat, Oct 31</div>
        <div style={{ color: GREY, fontSize: 17, marginTop: 16 }}>84% battery</div>
      </div>
    </div>
  );
};

export const Island: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = frame / fps;
  const { w, h, r, y } = shapeAt(s);

  // black on black: only a hairline rim says the shape is there. It vanishes for the hole,
  // so the island itself becomes the dark core of the charging scene.
  const toCore = ramp(s, cues.chargeCollapse + 0.15, cues.chargeIgnite) * (1 - ramp(s, cues.chargeImplode + 0.5, cues.chargeCompact));
  const born = ramp(s, cues.notificationPill, cues.notificationPill + 0.45, settle);
  const rim = 0.2 * born * (1 - toCore);
  const opacity = born * (1 - ramp(s, cues.endCard - 0.5, cues.endCard - 0.1));

  const compact = (from: number, to: number) => appear(s, from, to);
  const dotGlow = appear(s, cues.musicDot + 0.32, cues.musicOpen - 0.1, 0.4);
  const privacy = appear(s, cues.micCompact + 0.34, cues.desktop - 0.25);
  const micLabel = appear(s, cues.micLabel + 0.18, cues.desktop - 0.25);
  const percent = Math.round(interpolate(ramp(s, cues.chargeCount, cues.chargeCount + 1.6), [0, 1], [61, 84]));

  const zoom = ZOOM + (1 - ZOOM) * ramp(s, cues.desktop, cues.desktop + 0.65);

  return (
    <div style={{ position: "absolute", inset: 0, transformOrigin: `960px ${MID}px`, scale: zoom }}>
    <div
      style={{
        position: "absolute",
        left: 960 - w / 2,
        top: y - h / 2,
        width: w,
        height: h,
        borderRadius: r,
        background: "#000",
        boxShadow: `0 0 0 1px rgba(255,255,255,${rim})`,
        overflow: "hidden",
        opacity,
      }}
    >
      <Layer s={s} from={cues.notificationOpen} to={cues.chargeCollapse + 0.1}>
        <Notification s={s} />
      </Layer>
      <Layer s={s} from={cues.chargeCompact} to={cues.permissionOpen + 0.2} padding="0 22px">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", opacity: compact(cues.chargeCompact + 0.25, cues.permissionOpen - 0.2) }}>
          <svg width="18" height="24" viewBox="0 0 12 16" fill={GOLD}>
            <path d="M7 0 1 9h4l-1 7 7-10H6.500z" />
          </svg>
          <div style={{ color: GOLD, fontSize: 22, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{percent}%</div>
        </div>
      </Layer>
      <Layer s={s} from={cues.permissionOpen} to={cues.musicDot + 0.1}>
        <Permission s={s} />
      </Layer>
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 14, height: 14, marginLeft: -7, marginTop: -7, borderRadius: 7, background: BLUE, opacity: dotGlow, boxShadow: `0 0 ${22 + 14 * Math.sin(s * 3)}px ${BLUE}` }} />
      <Layer s={s} from={cues.musicOpen} to={cues.micCompact + 0.1}>
        <Player s={s} />
      </Layer>
      <Layer s={s} from={cues.micCompact} to={cues.desktop} padding="0 20px">
        <div style={{ display: "flex", alignItems: "center", gap: 12, opacity: privacy }}>
          <Art size={30} />
          <Equalizer s={s} size={0.62} />
          <div style={{ flex: 1, textAlign: "right", color: WHITE, fontSize: 21, fontWeight: 500, whiteSpace: "nowrap", opacity: micLabel, translate: `${(1 - micLabel) * 8}px 0` }}>Microphone in use</div>
          <div style={{ width: 11, height: 11, borderRadius: 6, flexShrink: 0, background: MIC, boxShadow: `0 0 8px ${MIC}88` }} />
        </div>
      </Layer>
      <Layer s={s} from={cues.finalOpen} to={cues.finalClose + 0.1} padding="0 28px">
        <FinalOpen s={s} />
      </Layer>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", opacity: Math.max(appear(s, cues.desktop + 0.3, cues.finalOpen - 0.1), appear(s, cues.finalClose + 0.32, null)) }}>
        <Art size={24} />
        <Equalizer s={s - 6} size={0.5} />
      </div>
    </div>
    </div>
  );
};
