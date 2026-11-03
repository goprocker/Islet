import { Audio } from "@remotion/media";
import { loadFont } from "@remotion/google-fonts/Inter";
import { AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import cues from "./cues.json";

const { fontFamily } = loadFont("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });

const WHITE = "#f5f5f7";
const GREY = "#86868b";
const GOLD = "#e0b53c";
const VIOLET = "#c9b8ff";
const WARN = "#ffb340";
const OK = "#63d47a";

// landings decelerate hard, exits accelerate, whips do both
const land = Easing.bezier(0.16, 1, 0.3, 1);
const leave = Easing.bezier(0.7, 0, 1, 0.4);
const whip = Easing.bezier(0.8, 0, 0.1, 1);
const pop = Easing.bezier(0.3, 1.3, 0.5, 1); // the app's own notch curve

const ramp = (s: number, from: number, to: number, easing: (t: number) => number = land) =>
  interpolate(s, [from, to], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });

const useSeconds = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return { s: frame / fps, dt: 1 / fps };
};

// piecewise tracks: each key eases in over its own duration, starting at its time
type Key = { t: number; d: number; e?: (t: number) => number; v: Record<string, number> };
const track = (keys: Key[], s: number) => {
  const out = { ...keys[0].v };
  for (const k of keys.slice(1)) {
    const u = ramp(s, k.t, k.t + k.d, k.e ?? land);
    for (const n of Object.keys(k.v)) out[n] += (k.v[n] - out[n]) * u;
  }
  return out;
};

// w, h, r: the notch outline in 3x app pixels. top: 0 = square top edge against the screen
const SHAPE: Key[] = [
  { t: 0, d: 0, v: { w: 96, h: 96, r: 48, top: 48 } },
  { t: cues.pill, d: 0.45, e: pop, v: { w: 450, h: 96, r: 48, top: 48 } },
  { t: cues.drop, d: 0.5, e: pop, v: { w: 1920, h: 450, r: 78, top: 0 } },
  { t: cues.toast, d: 0.45, e: pop, v: { w: 1200, h: 300, r: 66, top: 0 } },
  { t: cues.altF4 - 0.05, d: 0.35, e: pop, v: { w: 450, h: 90, r: 42, top: 0 } },
];

// z: zoom. x: the notch-space point at screen centre. y: notch top on screen
const CAMERA: Key[] = [
  { t: 0, d: 0, v: { z: 2.1, x: 960, y: 440 } },
  { t: 0.2, d: 1.7, e: (u) => u, v: { z: 2.3, x: 960, y: 430 } },
  { t: cues.pill, d: 0.45, v: { z: 2.05, x: 960, y: 440 } },
  { t: cues.drop, d: 0.5, v: { z: 0.94, x: 960, y: 0 } },
  { t: cues.drop + 0.5, d: 1.5, e: (u) => u, v: { z: 0.98, x: 960, y: 0 } },
  { t: cues.music - 0.1, d: 0.5, e: whip, v: { z: 1.78, x: 985, y: 0 } },
  { t: cues.agents - 0.1, d: 0.42, e: whip, v: { z: 1.78, x: 540, y: 0 } },
  { t: cues.needsYou + 0.05, d: 0.6, v: { z: 1.9, x: 505, y: 0 } },
  { t: cues.toast - 0.05, d: 0.5, v: { z: 1.4, x: 960, y: 0 } },
  { t: cues.altF4 - 0.05, d: 0.4, v: { z: 2.2, x: 960, y: 200 } },
  { t: cues.hole - 0.15, d: 0.3, e: leave, v: { z: 5, x: 960, y: 500 } },
  { t: cues.implode, d: 0.5, v: { z: 2.2, x: 960, y: 200 } },
];

// the same beats framed for 1080x1920: one column at a time, the full notch only fits small
const CAMERA_VERTICAL: Key[] = [
  { t: 0, d: 0, v: { z: 2.1, x: 960, y: 760 } },
  { t: 0.2, d: 1.7, e: (u) => u, v: { z: 2.3, x: 960, y: 750 } },
  { t: cues.pill, d: 0.45, v: { z: 2.05, x: 960, y: 760 } },
  { t: cues.drop, d: 0.5, v: { z: 0.54, x: 960, y: 0 } },
  { t: cues.drop + 0.5, d: 1.5, e: (u) => u, v: { z: 0.55, x: 960, y: 0 } },
  { t: cues.music - 0.1, d: 0.5, e: whip, v: { z: 1, x: 975, y: 0 } },
  { t: cues.agents - 0.1, d: 0.42, e: whip, v: { z: 2.1, x: 240, y: 0 } },
  { t: cues.needsYou + 0.05, d: 0.6, v: { z: 2.2, x: 234, y: 0 } },
  { t: cues.toast - 0.05, d: 0.5, v: { z: 0.85, x: 960, y: 0 } },
  { t: cues.altF4 - 0.05, d: 0.4, v: { z: 2.2, x: 960, y: 420 } },
  { t: cues.hole - 0.15, d: 0.3, e: leave, v: { z: 5, x: 960, y: 760 } },
  { t: cues.implode, d: 0.5, v: { z: 2.2, x: 960, y: 420 } },
];

const useVertical = () => {
  const { width, height } = useVideoConfig();
  return height > width;
};

const Icon: React.FC<{ d: string; size?: number; color?: string; fill?: boolean }> = ({ d, size = 48, color = "currentColor", fill }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? color : "none"} stroke={fill ? "none" : color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const ICONS = {
  moon: "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z",
  clip: "M9 4h6v3H9zM7 5.5H5.5V21h13V5.5H17M8.5 12h7M8.5 16h7",
  folder: "M3 6.5h6l2 2.5h10v10.5H3z",
  heart: "M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11Z",
  prev: "M6 5v14M19 5 9 12l10 7z",
  pause: "M8 5v14M16 5v14",
  next: "M18 5v14M5 5l10 7-10 7z",
  sun: "M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9ZM12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19",
  lyrics: "M4 7h16M4 12h11M4 17h14",
  album: "M4 4h16v16H4zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  timer: "M12 8v5l3 2M12 22a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM9 2h6",
};

const Art: React.FC<{ size: number; radius: number }> = ({ size, radius }) => (
  <div style={{ width: size, height: size, borderRadius: radius, background: "radial-gradient(circle at 34% 28%, #f8dd85, #c08a24 52%, #4d300a)", boxShadow: "inset 0 0 0 1px #ffffff26" }} />
);

const Wave: React.FC<{ s: number }> = ({ s }) => {
  const beat = Math.exp(-((s * 2) % 1) * 3.5);
  return (
    <div style={{ position: "absolute", left: 1310, top: 74, display: "flex", gap: 9, alignItems: "center", height: 60 }}>
      {[0.55, 0.85, 1, 0.75, 0.6, 0.4, 0.3].map((a, i) => (
        <div key={i} style={{ width: 12, borderRadius: 6, background: GOLD, height: 12 + 46 * a * (0.25 + 0.75 * beat * Math.abs(Math.sin(s * 9 + i * 1.3))) }} />
      ))}
    </div>
  );
};

const Text: React.FC<{ x: number; y: number; size: number; color?: string; weight?: number; children: React.ReactNode }> = ({ x, y, size, color = WHITE, weight = 400, children }) => (
  <div style={{ position: "absolute", left: x, top: y, fontSize: size, color, fontWeight: weight, whiteSpace: "nowrap", letterSpacing: "-0.012em" }}>{children}</div>
);

// the open notch, laid out from docs/open.png at 3x. The track and the sender are fictional stand-ins
const OpenNotch: React.FC<{ s: number }> = ({ s }) => {
  const stagger = (i: number) => ({
    opacity: ramp(s, cues.drop + 0.1 + i * 0.07, cues.drop + 0.3 + i * 0.07),
    translate: `0 ${(1 - ramp(s, cues.drop + 0.1 + i * 0.07, cues.drop + 0.5 + i * 0.07)) * 26}px`,
  });
  // rack focus: only the column we are talking about stays lit
  const left = s >= cues.agents - 0.1 && s < cues.toast;
  const center = s >= cues.music - 0.1 && s < cues.agents - 0.1;
  const dimLeft = 1 - 0.72 * ramp(s, cues.music - 0.1, cues.music + 0.2) * (center ? 1 : 0);
  const dimMusic = 1 - 0.8 * (left ? ramp(s, cues.agents - 0.1, cues.agents + 0.2) : 0);
  const asking = s >= cues.needsYou && s < cues.allow + 0.02;
  const allowed = s >= cues.allow + 0.4;
  const press = s >= cues.allow - 0.03 && s < cues.allow + 0.12 ? 0.92 : 1;
  const buttons = ramp(s, cues.needsYou + 0.15, cues.needsYou + 0.45, pop) * (1 - ramp(s, cues.allow + 0.2, cues.allow + 0.4, leave));
  const progress = 0.62 + (s - cues.drop) * 0.012;
  const clock = s < cues.toast - 1 ? "7:08 PM" : "7:09 PM";
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 450 }}>
      <div style={{ ...stagger(0), position: "absolute", inset: 0, opacity: stagger(0).opacity * dimLeft }}>
        <div style={{ position: "absolute", left: 52, top: 54, width: 20, height: 20, borderRadius: 10, background: asking ? WARN : VIOLET, boxShadow: `0 0 18px ${asking ? WARN : VIOLET}` }} />
        <div style={{ position: "absolute", left: 88, top: 36, padding: "6px 22px 8px", borderRadius: 40, background: "#2c2c30", fontSize: 32, color: WHITE, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 14, height: 14, borderRadius: 7, background: "#5ac8fa" }} />
          islet
        </div>
        <div style={{ position: "absolute", left: 226, top: 36, padding: "6px 22px 8px", borderRadius: 40, background: "#1c1c1f", fontSize: 32, color: GREY, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 14, height: 14, borderRadius: 7, background: OK }} />
          api
        </div>
        <Text x={54} y={104} size={32} color={asking ? WARN : GREY}>{asking ? "Claude · Needs you" : "Claude · Working"}</Text>
        {s < cues.needsYou || s >= cues.allow + 0.4 ? (
          <>
            <div style={{ position: "absolute", left: 54, top: 158, width: 380, fontSize: 34, lineHeight: 1.25, color: WHITE }}>{allowed ? "Ran npm test" : "Edited notch.css, notch.js"}</div>
            <Text x={54} y={254} size={32} color={GREY}>{allowed ? "Edited notch.css, notch.js" : "Ran npm test"}</Text>
            <Text x={54} y={304} size={32} color={GREY}>Read notch.js</Text>
          </>
        ) : (
          <Text x={54} y={158} size={34}>Run npm test?</Text>
        )}
        {buttons > 0.01 && (
          <div style={{ position: "absolute", left: 54, top: 230, display: "flex", gap: 18, opacity: Math.min(1, buttons), scale: 0.9 + 0.1 * buttons, transformOrigin: "left" }}>
            <div style={{ padding: "16px 44px", borderRadius: 22, background: WHITE, color: "#000", fontSize: 34, fontWeight: 600, scale: press }}>Allow</div>
            <div style={{ padding: "16px 44px", borderRadius: 22, background: "#2c2c30", color: WHITE, fontSize: 34, fontWeight: 600 }}>Deny</div>
          </div>
        )}
      </div>
      <div style={{ position: "absolute", left: 468, top: 36, width: 2, height: 378, background: "#ffffff1f" }} />
      <div style={{ ...stagger(1), position: "absolute", inset: 0, opacity: stagger(1).opacity * dimMusic }}>
        <div style={{ position: "absolute", left: 512, top: 36 }}><Art size={120} radius={24} /></div>
        <Text x={660} y={42} size={40} weight={600}>Monsoon Letters</Text>
        <Text x={660} y={100} size={32} color={GREY}>The Quiet Rooms</Text>
        <div style={{ position: "absolute", left: 1205, top: 74, color: WHITE }}><Icon d={ICONS.heart} size={50} /></div>
        <Wave s={s} />
        <Text x={512} y={180} size={28} color={GREY}>4:40</Text>
        <div style={{ position: "absolute", left: 610, top: 194, width: 730, height: 8, borderRadius: 4, background: "#ffffff26" }}>
          <div style={{ width: `${Math.min(100, progress * 100)}%`, height: "100%", borderRadius: 4, background: GOLD }} />
        </div>
        <Text x={1380} y={180} size={28} color={GREY}>5:11</Text>
        <div style={{ position: "absolute", left: 830, top: 330, display: "flex", gap: 60, color: WHITE }}>
          <Icon d={ICONS.prev} size={56} /><Icon d={ICONS.pause} size={56} /><Icon d={ICONS.next} size={56} />
        </div>
        <div style={{ position: "absolute", left: 1290, top: 340, color: GOLD }}><Icon d={ICONS.sun} size={42} /></div>
        <Text x={1345} y={340} size={32} color={GREY}>30°C</Text>
      </div>
      <div style={{ position: "absolute", left: 1482, top: 36, width: 2, height: 378, background: "#ffffff1f" }} />
      <div style={{ ...stagger(2), position: "absolute", inset: 0 }}>
        <Text x={1520} y={30} size={62} weight={600}>{clock}</Text>
        <Text x={1522} y={112} size={30} color={GREY}>Sat, Oct 31</Text>
        <Text x={1522} y={320} size={36} color={GREY}>27%</Text>
        <Text x={1522} y={372} size={30} color={GREY}>On battery</Text>
      </div>
      <div style={{ position: "absolute", left: 1796, top: 36, width: 2, height: 378, background: "#ffffff1f" }} />
      <div style={{ ...stagger(3), position: "absolute", left: 1832, top: 46, display: "flex", flexDirection: "column", gap: 44, color: GREY }}>
        <Icon d={ICONS.moon} size={44} /><Icon d={ICONS.clip} size={44} /><Icon d={ICONS.folder} size={44} />
      </div>
    </div>
  );
};

const Toast: React.FC<{ s: number; w: number }> = ({ s, w }) => {
  const o = ramp(s, cues.toast + 0.15, cues.toast + 0.4) * (1 - ramp(s, cues.burst - 0.08, cues.burst));
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: w, height: 300, opacity: o }}>
      <div style={{ position: "absolute", left: 44, top: 44, width: 104, height: 104, borderRadius: 26, background: "#3b82f6", color: "#fff", fontSize: 56, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>M</div>
      <Text x={182} y={36} size={30} color={GREY}>Messages</Text>
      <Text x={182} y={80} size={36} weight={600}>Maya</Text>
      <div style={{ position: "absolute", left: 182, top: 132, width: 960, fontSize: 36, lineHeight: 1.32, color: "#e5e5ea" }}>
        Lunch at 1? The new place near the office has a table free, and I can book it if you're in.
      </div>
    </div>
  );
};

// a horizontal-only blur reads as speed; an even blur reads as out of focus
const SpeedBlur: React.FC<{ id: string; amount: number; children: React.ReactNode }> = ({ id, amount, children }) => (
  <AbsoluteFill style={{ filter: amount > 0.2 ? `url(#${id})` : undefined }}>
    <svg width={0} height={0} style={{ position: "absolute" }}>
      <filter id={id} x="-10%" width="120%" colorInterpolationFilters="sRGB">
        <feGaussianBlur stdDeviation={`${amount} 0`} />
      </filter>
    </svg>
    {children}
  </AbsoluteFill>
);

const Island: React.FC<{ s: number; dt: number }> = ({ s, dt }) => {
  const { width } = useVideoConfig();
  const camera = useVertical() ? CAMERA_VERTICAL : CAMERA;
  const shape = track(SHAPE, s);
  const cam = track(camera, s);
  const before = track(camera, s - dt);
  const speed = Math.abs(cam.x - before.x) * cam.z;
  const isOpen = s >= cues.drop && s < cues.toast + 0.1;
  const isToast = s >= cues.toast;
  const charging = ramp(s, cues.plug, cues.plug + 0.1) * (1 - ramp(s, cues.hole, cues.hole + 0.1)) + ramp(s, cues.implode + 0.2, cues.implode + 0.5) * (1 - ramp(s, cues.open + 0.6, cues.open + 1));
  const dotSize = 30 + 3 * Math.exp(-((s * 2) % 1) * 4);
  const pillContent = s >= cues.altF4 + 0.15;
  const toEnd = ramp(s, cues.end, cues.end + 0.5);
  const x = width / 2 - cam.x * cam.z;
  return (
    <SpeedBlur id="whip" amount={Math.min(40, speed * 0.32)}>
      <div
        style={{
          position: "absolute",
          left: x + (960 - shape.w / 2) * cam.z,
          top: cam.y,
          width: shape.w,
          height: shape.h,
          transformOrigin: "0 0",
          scale: cam.z,
          overflow: "hidden",
          background: "#000",
          borderRadius: `${shape.top}px ${shape.top}px ${shape.r}px ${shape.r}px`,
          boxShadow: charging > 0.01
            ? `0 0 0 1px #7dffa0, 0 0 ${24 + 10 * Math.sin(s * 3)}px #63d47a${Math.round(charging * 200).toString(16).padStart(2, "0")}`
            : "0 0 0 1px #ffffff24, 0 26px 90px #000",
        }}
      >
        {s < cues.drop && (
          <div style={{ position: "absolute", left: "50%", top: "50%", width: dotSize, height: dotSize, marginLeft: -dotSize / 2, marginTop: -dotSize / 2, borderRadius: "50%", background: VIOLET, boxShadow: `0 0 28px ${VIOLET}` }} />
        )}
        {isOpen && <OpenNotch s={s} />}
        {isToast && s < cues.altF4 && <Toast s={s} w={shape.w} />}
        {pillContent && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 22, opacity: 1 - toEnd * 0 }}>
            <Art size={60} radius={14} />
            <div style={{ width: 24, height: 24, borderRadius: 12, background: charging > 0.5 ? OK : VIOLET, boxShadow: `0 0 16px ${charging > 0.5 ? OK : VIOLET}` }} />
            <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
              {[0.6, 1, 0.8, 0.5, 0.35].map((a, i) => (
                <div key={i} style={{ width: 10, borderRadius: 5, background: GOLD, height: s > cues.stopB && s < cues.hole ? 10 : 10 + 30 * a * Math.abs(Math.sin(s * 8 + i)) }} />
              ))}
            </div>
          </div>
        )}
      </div>
    </SpeedBlur>
  );
};

// one line per screen. Lands fast, leaves faster
const Line: React.FC<{ s: number; from: number; to: number; text: string; top?: number; size?: number; color?: string; words?: boolean; vTop: number; vSize?: number }> = ({ s, from, to, text, top = 810, size = 112, color = WHITE, words, vTop, vSize }) => {
  const vertical = useVertical();
  if (s < from - 0.02 || s > to + 0.02) return null;
  const parts = words ? text.split(" ") : [text];
  const out = ramp(s, to - 0.14, to, leave);
  return (
    <div style={{ position: "absolute", left: vertical ? 70 : 0, right: vertical ? 70 : 0, top: vertical ? vTop : top, textAlign: "center", fontSize: vertical ? (vSize ?? size) : size, fontWeight: 600, letterSpacing: "-0.035em", color, lineHeight: 1.05, opacity: 1 - out, translate: `0 ${-out * 40}px` }}>
      {parts.map((p, i) => {
        const at = from + i * 0.25;
        const u = ramp(s, at, at + 0.32);
        return (
          <span key={i} style={{ display: "inline-block", opacity: ramp(s, at, at + 0.1), translate: `0 ${(1 - u) * 44}px`, scale: 1.06 - 0.06 * u, marginRight: i < parts.length - 1 ? "0.26em" : 0 }}>{p}</span>
        );
      })}
    </div>
  );
};

// one cut per beat, and the colour field flips with it
const BURST: { word: string; icon?: string; bg: string; fg: string }[] = [
  { word: "Lyrics.", icon: ICONS.lyrics, bg: "#000", fg: WHITE },
  { word: "Album view.", icon: ICONS.album, bg: GOLD, fg: "#000" },
  { word: "Weather.", icon: ICONS.sun, bg: "#000", fg: WHITE },
  { word: "Calendar.", icon: ICONS.calendar, bg: WHITE, fg: "#000" },
  { word: "Clipboard.", icon: ICONS.clip, bg: "#000", fg: WHITE },
  { word: "File shelf.", icon: ICONS.folder, bg: VIOLET, fg: "#000" },
  { word: "Do Not Disturb.", icon: ICONS.moon, bg: "#000", fg: WHITE },
  { word: "Timer.", icon: ICONS.timer, bg: WHITE, fg: "#000" },
];

const Burst: React.FC<{ s: number }> = ({ s }) => {
  const vertical = useVertical();
  if (s < cues.burst || s >= cues.altF4) return null;
  const i = Math.min(BURST.length - 1, Math.floor((s - cues.burst) / 0.5));
  const at = cues.burst + i * 0.5;
  const b = BURST[i];
  const u = ramp(s, at, at + 0.22);
  // the last word flies through the lens and the next shot is already underneath
  const fly = i === BURST.length - 1 ? ramp(s, cues.altF4 - 0.22, cues.altF4, leave) : 0;
  const dir = i % 2 === 0 ? 1 : -1;
  return (
    <AbsoluteFill style={{ background: b.bg, opacity: 1 - fly, alignItems: "center", justifyContent: "center", gap: 28, color: b.fg }}>
      <div style={{ translate: `0 ${(1 - u) * 60}px`, scale: 0.8 + 0.2 * u }}><Icon d={b.icon!} size={120} /></div>
      <div style={{ fontSize: vertical ? 160 : 196, fontWeight: 700, letterSpacing: "-0.045em", lineHeight: 1.02, textAlign: "center", padding: vertical ? "0 60px" : 0, whiteSpace: vertical ? "normal" : "nowrap", translate: `${(1 - u) * 140 * dir}px 0`, scale: 1 + 7 * fly + 0.03 * (s - at) }}>{b.word}</div>
    </AbsoluteFill>
  );
};

const Key: React.FC<{ label: string; s: number; at: number }> = ({ label, s, at }) => {
  const down = ramp(s, at, at + 0.05) * (1 - ramp(s, at + 0.28, at + 0.42));
  const inn = ramp(s, cues.altF4 + 0.1, cues.altF4 + 0.35, pop);
  return (
    <div style={{ width: 210, height: 150, borderRadius: 30, background: down > 0.5 ? "#3a3a3e" : "#1c1c1f", boxShadow: `inset 0 0 0 2px #ffffff22, 0 ${14 - 11 * down}px 0 #0c0c0e`, translate: `0 ${11 * down}px`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 58, fontWeight: 600, color: WHITE, opacity: inn }}>{label}</div>
  );
};

const AltF4: React.FC<{ s: number }> = ({ s }) => {
  const vertical = useVertical();
  if (s < cues.altF4 || s >= cues.stopB) return null;
  return (
    <div style={{ position: "absolute", top: vertical ? 760 : 520, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 34 }}>
      <Key label="Alt" s={s} at={cues.keyPress} />
      <div style={{ fontSize: 64, color: GREY, opacity: ramp(s, cues.altF4 + 0.15, cues.altF4 + 0.3) }}>+</div>
      <Key label="F4" s={s} at={cues.keyPress + 0.25} />
    </div>
  );
};

// the charger moment: bent light around a black disc, driven only by time
const BlackHole: React.FC<{ s: number }> = ({ s }) => {
  const vertical = useVertical();
  if (s < cues.hole || s > cues.implode + 0.42) return null;
  const birth = ramp(s, cues.hole, cues.hole + 0.7);
  const gone = ramp(s, cues.implode, cues.implode + 0.4, leave);
  const scale = (vertical ? 0.66 : 1) * (0.2 + 0.8 * birth + 0.1 * (s - cues.hole) / 3.5) * (1 - gone);
  const flash = Math.exp(-(s - cues.hole) * 7);
  const spin = s * 170;
  const fire = (a: number) => `conic-gradient(from ${spin * a}deg, #fff4d6, #ffb347, #b4380c, #ffd98a, #ff8c2a, #5c1704, #ffe7ad, #ffb347, #fff4d6)`;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", background: "#000", opacity: Math.min(1, ramp(s, cues.hole, cues.hole + 0.05)) }}>
      <div style={{ position: "relative", width: 1000, height: 1000, scale, rotate: "-9deg" }}>
        {/* glow */}
        <div style={{ position: "absolute", inset: -220, borderRadius: "50%", background: "radial-gradient(circle, #ff9a3c55 22%, #ff6a0018 45%, transparent 66%)" }} />
        {/* far side of the disc, lensed up and over the shadow */}
        <div style={{ position: "absolute", inset: 178, borderRadius: "50%", background: fire(0.6), filter: "blur(10px)", WebkitMaskImage: "radial-gradient(circle closest-side, transparent 88%, #000 93%, transparent 100%)" }} />
        {/* back of the flat disc */}
        <div style={{ position: "absolute", left: -420, right: -420, top: 425, height: 150, borderRadius: "50%", background: `linear-gradient(90deg, #ff6a1088, #ffd9a0cc, #ffffffee), ${fire(1)}`, filter: "blur(7px)", WebkitMaskImage: "radial-gradient(ellipse closest-side, transparent 30%, #000 37%, #000 46%, #0008 66%, transparent 100%)" }} />
        {/* shadow, then the thin photon ring */}
        <div style={{ position: "absolute", inset: 215, borderRadius: "50%", background: "#000", boxShadow: "0 0 0 5px #ffe9c0, 0 0 26px 8px #ffb347" }} />
        {/* near side of the disc crosses in front of the shadow */}
        <div style={{ position: "absolute", left: -420, right: -420, top: 425, height: 150, borderRadius: "50%", background: `linear-gradient(90deg, #ff6a1088, #ffd9a0cc, #ffffffee), ${fire(1)}`, filter: "blur(5px)", clipPath: "inset(50% 0 0 0)", WebkitMaskImage: "radial-gradient(ellipse closest-side, transparent 30%, #000 37%, #000 46%, #0008 66%, transparent 100%)" }} />
      </div>
      <div style={{ position: "absolute", bottom: vertical ? 480 : 84, left: 0, right: 0, textAlign: "center", color: WHITE, fontSize: vertical ? 34 : 40, fontWeight: 500, letterSpacing: vertical ? "0.3em" : "0.42em", opacity: ramp(s, cues.hole + 1, cues.hole + 1.4) * (1 - gone) }}>CHARGING INITIATED</div>
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
    </AbsoluteFill>
  );
};

const EndCard: React.FC<{ s: number }> = ({ s }) => {
  const vertical = useVertical();
  if (s < cues.end) return null;
  const u = ramp(s, cues.end, cues.end + 0.45);
  const fade = ramp(s, cues.length - 0.6, cues.length - 0.05, (t) => t);
  return (
    <AbsoluteFill style={{ background: `rgba(0,0,0,${u})`, alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <div style={{ color: WHITE, fontSize: 210, fontWeight: 600, letterSpacing: "-0.045em", opacity: u, scale: 1.05 - 0.05 * u + 0.008 * (s - cues.end) }}>Islet<span style={{ color: VIOLET, textShadow: `0 0 34px ${VIOLET}` }}>.</span></div>
      <div style={{ color: GREY, fontSize: 54, fontWeight: 500, letterSpacing: "-0.015em", marginTop: 8, opacity: ramp(s, cues.end + 0.5, cues.end + 0.8) }}>The notch Windows never had.</div>
      <div style={{ color: vertical ? VIOLET : "#6e6e73", fontSize: vertical ? 58 : 30, fontWeight: vertical ? 600 : 400, marginTop: vertical ? 70 : 46, opacity: ramp(s, cues.end + 1, cues.end + 1.3) }}>{vertical ? "islet26.netlify.app" : "github.com/goprocker/Islet"}</div>
      <AbsoluteFill style={{ background: "#000", opacity: fade }} />
    </AbsoluteFill>
  );
};

export const AppleEdit: React.FC = () => {
  const { s, dt } = useSeconds();
  return (
    <AbsoluteFill style={{ fontFamily, overflow: "hidden", background: "radial-gradient(1300px 800px at 50% 18%, #1b1b22 0%, #0a0a0d 55%, #030304 100%)" }}>
      <Audio src={staticFile("score-apple.wav")} />
      <Island s={s} dt={dt} />
      <Line s={s} from={0.75} to={cues.pill - 0.05} text="Small." top={760} vTop={1060} />
      <Line s={s} from={cues.pill + 0.5} to={cues.stopA} text="Until it isn't." top={760} vTop={1060} words />
      <Line s={s} from={cues.drop + 0.4} to={cues.music - 0.1} text="Everything. In one glance." top={640} size={124} vTop={560} vSize={120} words />
      <Line s={s} from={cues.music + 0.35} to={cues.agents - 0.1} text="Your music, live." top={900} size={100} vTop={620} vSize={112} words />
      <Line s={s} from={cues.agents + 0.3} to={cues.needsYou} text="Claude Code. Codex." top={900} size={100} vTop={1090} vSize={112} words />
      <Line s={s} from={cues.needsYou + 0.2} to={cues.toast - 0.05} text="Allow it from the notch." top={900} size={92} vTop={1090} vSize={104} words />
      <Line s={s} from={cues.toast + 0.45} to={cues.burst - 0.05} text="Every message. In full." top={640} size={116} vTop={520} vSize={120} words />
      <Burst s={s} />
      <AltF4 s={s} />
      <Line s={s} from={cues.keyPress + 0.45} to={cues.stopB - 0.02} text="Still here." top={750} size={104} vTop={1000} />
      <Line s={s} from={cues.stopB + 0.45} to={cues.plug - 0.1} text="Now plug it in." top={700} size={104} vTop={900} color={GREY} />
      <BlackHole s={s} />
      <Line s={s} from={cues.open + 0.12} to={cues.windows - 0.02} text="Open source." top={640} size={170} vTop={860} vSize={132} />
      <Line s={s} from={cues.windows + 0.12} to={cues.end - 0.02} text="Windows 10 and 11." top={640} size={150} vTop={860} vSize={132} />
      <EndCard s={s} />
    </AbsoluteFill>
  );
};
