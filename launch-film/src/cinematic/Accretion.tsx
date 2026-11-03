import { useLayoutEffect, useRef } from "react";
import { random, useCurrentFrame, useVideoConfig } from "remotion";
import cues from "./cues.json";
import { ramp } from "./motion";

// Particle accretion disk seen almost edge-on. Each streak orbits at a Keplerian rate and is
// bent by the thin-lens equation, which is what lifts the far side of the disk over the core.
const W = 1920, H = 1080, CX = 960, CY = 430, CORE = 118, RES = 2;
const INNER = CORE * 1.55, OUTER = CORE * 6.6, FLAT = 0.17, TILT = -0.09, LENS = CORE * 0.66;
const COUNT = 2600, STARS = 260;

const grains = Array.from({ length: COUNT }, (_, i) => {
  const u = random(`r${i}`);
  // denser and hotter toward the inner edge
  const r = INNER + (OUTER - INNER) * u ** 1.9;
  return {
    r,
    phi: random(`a${i}`) * Math.PI * 2,
    width: 0.6 + random(`w${i}`) * 1.1,
    bright: 0.35 + random(`b${i}`) * 0.65,
    omega: 1.55 * (INNER / r) ** 1.5,
    heat: (r - INNER) / (OUTER - INNER),
  };
});

const stars = Array.from({ length: STARS }, (_, i) => ({
  x: (random(`sx${i}`) - 0.5) * W * 1.1,
  y: (random(`sy${i}`) - 0.5) * H * 1.1,
  a: 0.08 + random(`sa${i}`) ** 3 * 0.42,
}));

// warm amber to pale gold, never a saturated orange
const heatColor = (h: number) => (h < 0.1 ? "255,240,214" : h < 0.28 ? "255,219,164" : h < 0.55 ? "240,186,120" : "201,140,84");

const project = (r: number, phi: number, lens: number) => {
  const sin = Math.sin(phi);
  const dx = r * Math.cos(phi);
  const dy = r * sin * FLAT;
  // the pull eases on just before the disk passes behind the core, so its edge has no kink
  const behind = Math.max(0, (sin + 0.4) / 1.4);
  const b = Math.hypot(dx, dy) || 0.001;
  const k = (b + Math.sqrt(b * b + 4 * lens * LENS * r * behind * behind)) / (2 * b);
  const x = dx * k, y = -dy * k; // canvas y points down, the far half sits above the core
  return { x: x * Math.cos(TILT) - y * Math.sin(TILT), y: x * Math.sin(TILT) + y * Math.cos(TILT), far: sin > 0 };
};

const paint = (ctx: CanvasRenderingContext2D, s: number) => {
  const born = ramp(s, cues.chargeIgnite, cues.chargeIgnite + 1.9);
  const gone = ramp(s, cues.chargeImplode, cues.chargeCompact - 0.05);
  const fade = 1 - ramp(s, cues.chargeImplode + 0.55, cues.chargeCompact);
  const lens = ramp(s, cues.chargeIgnite + 0.2, cues.chargeIgnite + 2.2) * (1 - gone);
  const phase = s - cues.chargeIgnite;
  const push = 1 + 0.05 * ramp(s, cues.chargeIgnite, cues.chargeImplode, (t) => t);

  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.translate(CX, CY);
  ctx.scale(push, push);
  ctx.globalCompositeOperation = "lighter";

  // background stars slide away from the core as its pull comes on: the gravitational distortion
  const theta2 = (CORE * 1.5 * lens) ** 2;
  ctx.fillStyle = "#dfe6ff";
  for (const st of stars) {
    const b = Math.hypot(st.x, st.y) || 1;
    const k = (b + Math.sqrt(b * b + 4 * theta2)) / (2 * b);
    ctx.globalAlpha = st.a * born * fade * 0.8;
    ctx.fillRect(st.x * k - 0.6, st.y * k - 0.6, 1.2, 1.2);
  }

  // a restrained halo, only strong enough to give the disk some air
  const halo = ctx.createRadialGradient(0, 0, CORE, 0, 0, CORE * 4.4);
  halo.addColorStop(0, "rgba(232,170,96,0.15)");
  halo.addColorStop(0.45, "rgba(232,170,96,0.035)");
  halo.addColorStop(1, "rgba(232,170,96,0)");
  ctx.globalAlpha = born * fade;
  ctx.fillStyle = halo;
  ctx.save();
  ctx.scale(1, 0.72);
  ctx.fillRect(-CORE * 4.4, -CORE * 4.4, CORE * 8.8, CORE * 8.8);
  ctx.restore();

  // nothing escapes the core: keep it true black under the stars and halo
  ctx.globalCompositeOperation = "destination-out";
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(0, 0, CORE, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "lighter";

  // far half first, the near half then crosses in front of the core
  ctx.lineCap = "round";
  for (const pass of [true, false]) {
    for (const g of grains) {
      // the disk grows outward from the core, and on the way out it falls back in
      const appear = Math.min(1, Math.max(0, (born * 1.25 - g.heat) / 0.25));
      if (appear <= 0) continue;
      const r = g.r * (1 - 0.72 * gone * gone) * (0.82 + 0.18 * born);
      const omega = g.omega * (1 + gone * 2.2);
      const phi = g.phi + phase * omega;
      const head = project(r, phi, lens);
      if (head.far !== pass) continue;
      const tail = project(r, phi - (0.07 + 0.11 * omega), lens);
      // relativistic beaming: the side turning toward the viewer is much brighter
      const beam = (1 + 0.42 * (1 - g.heat * 0.6) * Math.cos(phi)) ** 3;
      ctx.globalAlpha = Math.min(1, g.bright * appear * fade * 0.34 * beam * (1 - g.heat * 0.65));
      ctx.strokeStyle = `rgb(${heatColor(g.heat)})`;
      ctx.lineWidth = g.width;
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(head.x, head.y);
      ctx.stroke();
    }
    if (pass) {
      // the photon ring: light that has been around the core, drawn over the far half only
      const ring = ramp(s, cues.chargeIgnite - 0.05, cues.chargeIgnite + 0.55) * (1 - gone);
      const rr = CORE * 1.03 * (0.8 + 0.2 * ramp(s, cues.chargeIgnite - 0.05, cues.chargeIgnite + 0.7));
      const lit = ctx.createLinearGradient(-rr, 0, rr, 0);
      lit.addColorStop(0, "rgba(255,240,214,1)");
      lit.addColorStop(0.55, "rgba(255,219,164,0.75)");
      lit.addColorStop(1, "rgba(240,186,120,0.42)");
      ctx.strokeStyle = lit;
      ctx.globalAlpha = ring * 0.22;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = ring;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
};

export const Accretion: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) paint(ctx, frame / fps);
  }, [frame, fps]);

  return <canvas ref={ref} width={W * RES} height={H * RES} style={{ position: "absolute", inset: 0, width: W, height: H }} />;
};

export const CORE_GEOMETRY = { x: CX, y: CY, r: CORE };
