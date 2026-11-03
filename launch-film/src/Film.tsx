import { Audio } from "@remotion/media";
import { loadFont } from "@remotion/google-fonts/Inter";
import { AbsoluteFill, Easing, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Notch } from "./Notch";

const { fontFamily } = loadFont("normal", { weights: ["400", "600", "700"], subsets: ["latin"] });

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const glide = Easing.bezier(0.65, 0, 0.2, 1);

// The stage is a 1920x1080 monitor with the notch at its top centre; the camera moves over it.
const Camera: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tall = height > width;
  const keys = [0, 90, 150, 205, 238, 745, 775, 925, 945, 1015, 1040, 1080, 1115, 1200];
  const z = tall
    ? [3, 3.2, 0.54, 0.54, 1.5, 1.56, 1.9, 1.98, 1.5, 1.5, 1.1, 1.1, 1.8, 1.84]
    : [3.2, 3.5, 0.9, 0.92, 2, 2.08, 2.5, 2.6, 2, 2, 1.9, 1.92, 2, 2.05];
  const y = tall
    ? [930, 930, 660, 660, 420, 420, 380, 380, 420, 420, 480, 480, 700, 700]
    : [470, 470, 54, 50, 110, 110, 70, 70, 110, 110, 150, 150, 300, 300];
  const zoom = interpolate(frame, keys, z, { ...clamp, easing: glide });
  const top = interpolate(frame, keys, y, { ...clamp, easing: glide });
  return (
    <div
      style={{
        position: "absolute",
        left: width / 2 - 960 * zoom,
        top,
        width: 1920,
        height: 1080,
        transformOrigin: "0 0",
        scale: zoom,
      }}
    >
      {children}
    </div>
  );
};

// An original abstract wallpaper and a plain taskbar, so it reads as a Windows PC
const Desktop: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  // the tall camera pulls back far enough in the finale to show the stage edge, so fade out sooner
  const finale = height > width ? 0 : 0.3;
  const opacity = interpolate(frame, [85, 135, 205, 240, 745, 775, 925, 950, 1015, 1035, 1060, 1100], [0, 1, 1, 0.3, 0.3, 0.06, 0.06, 0.3, 0.3, finale, finale, 0], clamp);
  const blur = interpolate(frame, [205, 240], [0, 26], clamp);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 28,
        overflow: "hidden",
        opacity,
        filter: `blur(${blur}px)`,
        background:
          "radial-gradient(900px 700px at 30% 85%, #2f6bff, transparent 70%), radial-gradient(900px 700px at 78% 65%, #a24bff, transparent 70%), radial-gradient(600px 500px at 55% 30%, #1fb6ff66, transparent 70%), #070b24",
      }}
    >
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 66,
          background: "rgba(20,22,40,0.72)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
        }}
      >
        {["#60cdff", "#ffffff", "#ffb900", "#7fba00", "#f25022", "#b4a0ff"].map((c) => (
          <div key={c} style={{ width: 34, height: 34, borderRadius: 8, background: c, opacity: 0.85 }} />
        ))}
      </div>
    </div>
  );
};

const Line: React.FC<{ text: string; hold: number; small?: boolean }> = ({ text, hold, small }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tall = height > width;
  const words = text.split(" ");
  const out = interpolate(frame, [hold - 8, hold], [1, 0], clamp);
  return (
    <AbsoluteFill
      style={{
        top: tall ? "58%" : "64%",
        bottom: "auto",
        height: tall ? 500 : 300,
        padding: "0 80px",
        boxSizing: "border-box",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        opacity: out,
      }}
    >
      <div style={{ color: "#f5f5f7", fontSize: small ? (tall ? 84 : 84) : tall ? 108 : 124, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.08, textWrap: "balance" }}>
        {words.map((w, i) => {
          const p = interpolate(frame, [i * 4, i * 4 + 18], [0, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
          return (
            <span key={i} style={{ display: "inline-block", marginRight: "0.26em", opacity: p, translate: `0 ${(1 - p) * 36}px`, filter: `blur(${(1 - p) * 14}px)` }}>
              {w}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const Vignette: React.FC = () => (
  <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.6) 100%)", pointerEvents: "none" }} />
);

const PlugFlash: React.FC = () => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ background: "#fff1cc", opacity: interpolate(frame, [12, 16, 32], [0, 0.32, 0], clamp) }} />;
};

export const Film: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: "#000", fontFamily, overflow: "hidden" }}>
      <Audio src={staticFile("score.wav")} />
      <Camera>
        <Desktop />
        <Notch />
      </Camera>
      <Vignette />
      <Sequence name="Flash" from={25 * fps} durationInFrames={2 * fps} layout="none">
        <PlugFlash />
      </Sequence>
      <Sequence name="Windows" from={4 * fps} durationInFrames={3 * fps} layout="none">
        <Line text="Windows never had one of these." hold={3 * fps} />
      </Sequence>
      <Sequence name="Music" from={8 * fps} durationInFrames={5 * fps} layout="none">
        <Line text="It listens." hold={5 * fps} />
      </Sequence>
      <Sequence name="Toast" from={13.5 * fps} durationInFrames={4.5 * fps} layout="none">
        <Line text="It tells you." hold={4.5 * fps} />
      </Sequence>
      <Sequence name="Agents" from={19 * fps} durationInFrames={6 * fps} layout="none">
        <Line text="It waits for your yes." hold={6 * fps} />
      </Sequence>
      <Sequence name="Power" from={27 * fps} durationInFrames={4 * fps} layout="none">
        <Line text="It has a sense of occasion." hold={4 * fps} />
      </Sequence>
      <Sequence name="Pill" from={34 * fps} durationInFrames={2 * fps} layout="none">
        <Line text="All in one small black pill." hold={2 * fps} />
      </Sequence>
      <Sequence name="End" from={38 * fps} durationInFrames={2 * fps} layout="none">
        <Line text="Free for Windows." hold={3 * fps} small />
      </Sequence>
      <Sequence name="URL" from={38.5 * fps} durationInFrames={1.5 * fps} layout="none">
        <Url />
      </Sequence>
    </AbsoluteFill>
  );
};

const Url: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill
      style={{
        top: height > width ? "76%" : "86%",
        bottom: "auto",
        height: 80,
        alignItems: "center",
        justifyContent: "center",
        color: "#a1a1a6",
        fontSize: height > width ? 44 : 44,
        opacity: interpolate(frame, [0, 12], [0, 1], clamp),
      }}
    >
      github.com/goprocker/Islet
    </AbsoluteFill>
  );
};
