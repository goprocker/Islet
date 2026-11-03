import { useLayoutEffect, useRef } from "react";
import { random, useCurrentFrame, useVideoConfig } from "remotion";

// Frame-driven port of ../renderer/blackhole.js: same disk, lens, ring and particles,
// with seeded randomness and no rAF so every frame renders deterministically.
const W = 112, H = 84, CX = 56, CY = 43, R = 12.5, TILT = -0.12, FLAT = 0.2, BANDS = 13, PARTS = 24;
const DPR = 6;
const HOLD_MS = 2000;

const ss = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
const bell = (a: number, b: number, t: number) => Math.sin(Math.PI * Math.min(1, Math.max(0, (t - a) / (b - a))));

const band = Array.from({ length: BANDS }, (_, i) => {
  const f = i / (BANDS - 1);
  return {
    f,
    // longer, finer streaks than the app: this is shown far larger than its 112px canvas
    dash: [5 + 16 * random(`d${i}`), 0.8 + 2 * random(`g${i}`)],
    speed: 1.8 / (0.35 + f) ** 1.5,
    off: random(`o${i}`) * 40,
  };
});
const parts = Array.from({ length: PARTS }, (_, i) => ({
  a: random(`pa${i}`) * Math.PI * 2,
  r: 1.5 + random(`pr${i}`) * 2,
  s: 0.6 + random(`ps${i}`) * 0.9,
}));

const paint = (ctx: CanvasRenderingContext2D, t: number, phase: number) => {
  const hole = ss(430, 660, t);
  const sweep = ss(650, 1150, t);
  const diskA = ss(650, 900, t);
  const lensA = ss(950, 1350, t);
  const boost = 0.6 * bell(1400, 2000, t);
  const partA = ss(750, 1050, t);
  const ring = ss(500, 720, t);
  const glowA = 0.8 * ss(650, 1200, t) + 0.5 * boost;
  const pointA = ss(250, 420, t) * (1 - ss(560, 760, t));
  const pointR = 2 + 7 * ss(250, 480, t);
  const ripple = (t - 430) / 480;

  const side = (inner: string, outer: string, a: string) => {
    const g = ctx.createLinearGradient(CX - 48, 0, CX + 48, 0);
    g.addColorStop(0, outer + "00");
    g.addColorStop(0.18, inner + a);
    g.addColorStop(0.5, inner + a);
    g.addColorStop(0.85, outer + "88");
    g.addColorStop(1, outer + "00");
    return g;
  };
  const set = band.map(({ f }) =>
    side(f < 0.25 ? "#fff1cc" : f < 0.6 ? "#ffcc78" : "#ff8c32", "#ff8c32", f < 0.25 ? "ff" : f < 0.6 ? "dd" : "88"),
  );
  const diskBand = (i: number, front: boolean) => {
    const b = band[i], rx = R + 4 + b.f * 30, mid = front ? Math.PI / 2 : Math.PI * 1.5, half = (sweep * Math.PI) / 2;
    ctx.strokeStyle = set[i];
    ctx.lineWidth = 1.05 - b.f * 0.4;
    ctx.lineCap = "round";
    ctx.setLineDash(b.dash);
    ctx.lineDashOffset = -(b.off + phase * b.speed);
    ctx.beginPath();
    ctx.ellipse(CX, CY, rx, rx * FLAT, TILT, mid - half, mid + half);
    ctx.stroke();
  };

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.globalCompositeOperation = "lighter";
  if (glowA > 0.01) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, "#f9731655");
    g.addColorStop(0.45, "#f9731622");
    g.addColorStop(1, "#f9731600");
    ctx.save();
    ctx.translate(CX, CY);
    ctx.scale(48, 30);
    ctx.globalAlpha = Math.min(1, glowA);
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  if (diskA > 0.01) {
    ctx.globalAlpha = diskA;
    for (let i = BANDS - 1; i >= 0; i--) diskBand(i, false);
  }
  if (lensA > 0.01) {
    for (let i = 0; i < 6; i++) {
      const r = R + 1.5 + i * 1.4, half = (sweep * Math.PI) / 2;
      ctx.globalAlpha = lensA * (1 - i / 7);
      ctx.strokeStyle = set[Math.min(BANDS - 1, i * 2)];
      ctx.lineWidth = 0.8;
      ctx.lineCap = "round";
      ctx.setLineDash(band[i].dash);
      ctx.lineDashOffset = -(band[i].off + phase * band[i].speed * 0.8);
      ctx.beginPath();
      ctx.ellipse(CX, CY - 1, r, r * 0.93, TILT, Math.PI * 1.5 - half, Math.PI * 1.5 + half);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  ctx.globalCompositeOperation = "source-over";
  if (hole > 0.01) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#020204";
    ctx.beginPath();
    ctx.arc(CX, CY, R * hole, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "lighter";
  if (ring > 0.01 && hole > 0.01) {
    ctx.strokeStyle = "#fff1cc";
    ctx.globalAlpha = ring * 0.35;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(CX, CY, R * hole + 0.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = ring;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(CX, CY, R * hole + 0.4, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (diskA > 0.01) {
    ctx.globalAlpha = Math.min(1, diskA * (1 + boost));
    for (let i = 0; i < BANDS; i++) diskBand(i, true);
  }
  ctx.setLineDash([]);
  if (partA > 0.01) {
    const c = Math.cos(TILT), sn = Math.sin(TILT), inward = ss(1400, 2000, t);
    ctx.fillStyle = "#ffe2b0";
    for (const p of parts) {
      const rr = R * (p.r - (p.r - 0.9) * inward * 0.5);
      if (rr < R * hole * 0.95) continue;
      const a = p.a + phase * p.s * 0.05 * (3 / p.r);
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr * FLAT;
      if (y < 0 && Math.abs(x) < R * hole) continue;
      ctx.globalAlpha = partA * (0.4 + 0.6 * (x < 0 ? 1 : 0.5));
      ctx.fillRect(CX + x * c - y * sn - 0.6, CY + x * sn + y * c - 0.6, 1.2, 1.2);
    }
  }
  if (pointA > 0.01) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.25, "#fff1cc");
    g.addColorStop(0.6, "#ffcc7855");
    g.addColorStop(1, "#ff8c3200");
    ctx.save();
    ctx.translate(CX, CY);
    ctx.scale(pointR, pointR);
    ctx.globalAlpha = pointA;
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  if (ripple > 0 && ripple < 1) {
    ctx.globalAlpha = (1 - ripple) * 0.5;
    ctx.strokeStyle = "#ffcc78";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(CX, CY, 4 + ripple * 44, (4 + ripple * 44) * 0.7, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
};

export const BlackHole: React.FC<{ startFrame: number; size: number }> = ({ startFrame, size }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    // the real animation runs ~2s; it is slowed for film and holds on the full disk
    const elapsed = Math.max(0, frame - startFrame) / fps;
    paint(ctx, Math.min(HOLD_MS, elapsed * 1000 * 0.6), elapsed * 60 * 0.6);
  }, [frame, startFrame, fps]);

  return (
    <canvas
      ref={ref}
      width={W * DPR}
      height={H * DPR}
      style={{ width: size, height: (size * H) / W, flexShrink: 0 }}
    />
  );
};
