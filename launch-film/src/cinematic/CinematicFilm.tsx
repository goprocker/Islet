import { Audio } from "@remotion/media";
import { loadFont } from "@remotion/google-fonts/Inter";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Accretion } from "./Accretion";
import cues from "./cues.json";
import { Island } from "./Island";
import { GOLD, GREY, WHITE, appear, glide, ramp, reveal, rise } from "./motion";

const { fontFamily } = loadFont("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });

const useSeconds = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return frame / fps;
};

const Wordmark: React.FC = () => {
  const s = useSeconds();
  const sweep = interpolate(s, [0.5, 2.8], [-30, 130]);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      {/* the barely visible light that passes behind the name */}
      <AbsoluteFill style={{ opacity: 0.05 * (1 - ramp(s, 2.3, 2.8)), background: `linear-gradient(102deg, transparent ${sweep - 18}%, #6f9bff ${sweep}%, transparent ${sweep + 18}%)` }} />
      <div
        style={{
          color: WHITE,
          fontSize: 124,
          fontWeight: 600,
          letterSpacing: `${interpolate(ramp(s, 0.4, 2.2, rise), [0, 1], [0.1, -0.025])}em`,
          opacity: appear(s, 0.45, 2.55, 0.9),
        }}
      >
        Islet
      </div>
    </AbsoluteFill>
  );
};

const Headline: React.FC<{ text: string; from: number; to: number }> = ({ text, from, to }) => {
  const s = useSeconds();
  if (s < from - 0.1 || s > to + 0.4) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 690,
        textAlign: "center",
        color: WHITE,
        fontSize: 84,
        fontWeight: 600,
        letterSpacing: "-0.028em",
        ...reveal(s, from, to, 14),
      }}
    >
      {text}
    </div>
  );
};

const ChargeReadout: React.FC = () => {
  const s = useSeconds();
  const at = cues.chargeCount;
  const out = cues.chargeImplode - 0.1;
  const value = Math.round(interpolate(ramp(s, at, at + 1.6), [0, 1], [61, 84]));
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 760, textAlign: "center", ...reveal(s, at, out, 14) }}>
      <div style={{ color: WHITE, fontSize: 112, fontWeight: 600, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{value}%</div>
      <div style={{ color: GOLD, fontSize: 26, fontWeight: 500, marginTop: 14, ...reveal(s, at + 0.3, out) }}>Charging</div>
    </div>
  );
};

// A composed, original dark desktop: the wallpaper is one quiet light, the taskbar plain shapes
const Desktop: React.FC = () => {
  const s = useSeconds();
  const icons = [0, 1, 2, 3, 4, 5];
  return (
    <AbsoluteFill
      style={{
        opacity: ramp(s, cues.desktop, cues.desktop + 0.65, glide) * (1 - ramp(s, cues.endCard - 0.5, cues.endCard - 0.1, glide)),
        scale: 1.025 - 0.025 * ramp(s, cues.desktop, cues.endCard, (t) => t),
        background: "radial-gradient(1500px 760px at 50% 118%, #3a5290 0%, #18233f 44%, #0a0e1a 76%, #040508 100%)",
      }}
    >
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 56, background: "rgba(16,18,26,0.82)", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
        {icons.map((i) => (
          <div key={i} style={{ width: 28, height: 28, borderRadius: 7, background: i === 0 ? "#7f94c8" : "#3a3f4c" }} />
        ))}
        <div style={{ position: "absolute", right: 22, color: "#c7c7cc", fontSize: 15, textAlign: "right", lineHeight: 1.25 }}>
          <div>7:08 PM</div>
          <div style={{ color: GREY }}>10/31/2026</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const EndCard: React.FC = () => {
  const s = useSeconds();
  const at = cues.endCard;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <div style={{ color: WHITE, fontSize: 132, fontWeight: 600, letterSpacing: "-0.03em", ...reveal(s, at, null, 12) }}>Islet.</div>
      <div style={{ color: GREY, fontSize: 44, fontWeight: 500, letterSpacing: "-0.012em", marginTop: 12, ...reveal(s, at + 0.42, null, 10) }}>A little more magic for Windows.</div>
    </AbsoluteFill>
  );
};

export const CinematicFilm: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: "#000", fontFamily, overflow: "hidden" }}>
      <Audio src={staticFile("score-cinematic.wav")} />
      <Desktop />
      <Wordmark />
      <Island />
      <Accretion />
      <ChargeReadout />
      <Headline text="Everything. In sight." from={cues.notificationOpen + 0.6} to={cues.chargeCollapse - 0.35} />
      <Headline text="Always in control." from={cues.permissionOpen + 0.7} to={cues.musicDot - 0.3} />
      <Headline text="In tune with you." from={cues.musicOpen + 0.7} to={cues.micCompact - 0.25} />
      <Headline text="Know when you're heard." from={cues.micLabel + 0.3} to={cues.desktop - 0.35} />
      <EndCard />
    </AbsoluteFill>
  );
};
