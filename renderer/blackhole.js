// Black hole (Gargantua-style) played on the notch when the charger goes in or out.
// Procedural Canvas 2D: a tilted accretion disk of streaky bands split into back/front halves
// around a dark event horizon, a lensed arch over the top, photon ring, ~24 particles.
// One play at a time; rAF only runs while playing, so it costs nothing when idle.
(() => {
  const W = 112, H = 84, CX = 56, CY = 43;
  const R = 12.5;                         // event horizon radius
  const TILT = -0.12, FLAT = 0.2;         // disk tilt (rad) and how squashed the ellipse is
  const BANDS = 13, PARTS = 24;
  const CONNECT_MS = 2800, DISCONNECT_MS = 1800, COLLAPSE_AT = { on: 2450, off: 1350 };

  const ss = (a, b, t) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
  const bell = (a, b, t) => Math.sin(Math.PI * Math.min(1, Math.max(0, (t - a) / (b - a))));

  let canvas, ctx, dpr = 0, grads = null;
  const band = []; // per band: inner/outer radius factor, dash pattern, speed
  for (let i = 0; i < BANDS; i++) {
    const f = i / (BANDS - 1);
    band.push({ f, dash: [2 + 7 * Math.random(), 1 + 4 * Math.random()], speed: 1.8 / (0.35 + f) ** 1.5, off: Math.random() * 40 });
  }
  const pa = new Float32Array(PARTS), pr = new Float32Array(PARTS), ps = new Float32Array(PARTS);
  const seedParticles = () => {
    for (let i = 0; i < PARTS; i++) { pa[i] = Math.random() * Math.PI * 2; pr[i] = 1.5 + Math.random() * 2; ps[i] = 0.6 + Math.random() * 0.9; }
  };

  // gradients are built once per dpr: warm and "dying" red sets, brighter on the approaching (left) side
  function build() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const side = (inner, outer, a) => {
      const g = ctx.createLinearGradient(CX - 48, 0, CX + 48, 0);
      g.addColorStop(0, outer + "00"); g.addColorStop(0.18, inner + a); g.addColorStop(0.5, inner + a);
      g.addColorStop(0.85, outer + "88"); g.addColorStop(1, outer + "00");
      return g;
    };
    const mk = (hot, mid, out) => Array.from({ length: BANDS }, (_, i) => {
      const f = i / (BANDS - 1);
      return side(f < 0.25 ? hot : f < 0.6 ? mid : out, out, f < 0.25 ? "ff" : f < 0.6 ? "dd" : "88");
    });
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    glow.addColorStop(0, "#f9731655"); glow.addColorStop(0.45, "#f9731622"); glow.addColorStop(1, "#f9731600");
    const point = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    point.addColorStop(0, "#ffffff"); point.addColorStop(0.25, "#fff1cc"); point.addColorStop(0.6, "#ffcc7855"); point.addColorStop(1, "#ff8c3200");
    grads = { warm: mk("#fff1cc", "#ffcc78", "#ff8c32"), red: mk("#ffb27a", "#ff6a2a", "#c2261a"), glow, point };
  }

  // one band of the disk: back half (behind the hole) or front half, swept open by `sweep`
  function diskBand(i, set, scale, sweep, phase, front) {
    const b = band[i], rx = (R + 4 + b.f * 30) * scale, ry = rx * FLAT;
    const mid = front ? Math.PI / 2 : Math.PI * 1.5, half = sweep * Math.PI / 2;
    ctx.strokeStyle = set[i];
    ctx.lineWidth = 1.7 - b.f * 0.6;
    ctx.setLineDash(b.dash);
    ctx.lineDashOffset = -(b.off + phase * b.speed);
    ctx.beginPath(); ctx.ellipse(CX, CY, rx, ry, TILT, mid - half, mid + half); ctx.stroke();
  }
  // lensed light: far side of the disk bent up over the hole, and a thin arc under it
  function lens(set, scale, a, sweep, phase) {
    for (let i = 0; i < 6; i++) {
      const r = (R + 1.5 + i * 1.4) * scale, half = sweep * Math.PI / 2;
      ctx.globalAlpha = a * (1 - i / 7);
      ctx.strokeStyle = set[Math.min(BANDS - 1, i * 2)];
      ctx.lineWidth = 1.3; ctx.setLineDash(band[i].dash); ctx.lineDashOffset = -(band[i].off + phase * band[i].speed * 0.8);
      ctx.beginPath(); ctx.ellipse(CX, CY - 1, r, r * 0.93, TILT, Math.PI * 1.5 - half, Math.PI * 1.5 + half); ctx.stroke();
    }
    for (let i = 0; i < 2; i++) {
      const r = (R + 1.2 + i * 1.3) * scale;
      ctx.globalAlpha = a * 0.45 * (1 - i / 3); ctx.strokeStyle = set[2 + i * 3];
      ctx.beginPath(); ctx.ellipse(CX, CY + 1, r, r * 0.9, TILT, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
    }
  }

  // s: the frame's parameters, all 0..1 except phase / scales
  function draw(s) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    if (s.glow > 0.01) {
      ctx.save(); ctx.translate(CX, CY); ctx.scale(48 * s.disk, 30 * s.disk); ctx.globalAlpha = s.glow;
      ctx.fillStyle = grads.glow; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
    }
    const sets = s.red > 0.01 ? [[grads.warm, 1 - s.red], [grads.red, s.red]] : [[grads.warm, 1]];
    // back half of disk + lensing, then the hole on top of them
    for (const [set, w] of sets) {
      if (s.diskA > 0.01) { ctx.globalAlpha = s.diskA * w; for (let i = BANDS - 1; i >= 0; i--) diskBand(i, set, s.disk, s.sweep, s.phase, false); }
      if (s.lens > 0.01) lens(set, s.hole, s.lens * w, s.sweep, s.phase);
    }
    ctx.setLineDash([]);
    ctx.globalCompositeOperation = "source-over";
    if (s.hole > 0.01) {
      ctx.globalAlpha = 1; ctx.fillStyle = "#020204";
      ctx.beginPath(); ctx.arc(CX, CY, R * s.hole, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = "lighter";
    if (s.ring > 0.01 && s.hole > 0.01) {
      const ringCol = s.red > 0.5 ? "#ff8c5a" : "#fff1cc";
      ctx.strokeStyle = ringCol;
      ctx.globalAlpha = s.ring * 0.35; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(CX, CY, R * s.hole + 0.6, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = s.ring; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(CX, CY, R * s.hole + 0.4, 0, Math.PI * 2); ctx.stroke();
    }
    // front half of the disk crosses in front of the hole
    for (const [set, w] of sets) {
      if (s.diskA > 0.01) { ctx.globalAlpha = s.diskA * w * (1 + s.boost); for (let i = 0; i < BANDS; i++) diskBand(i, set, s.disk, s.sweep, s.phase, true); }
    }
    ctx.setLineDash([]);
    // particles orbit on the disk plane; inward pulls them into the horizon
    if (s.partA > 0.01) {
      const c = Math.cos(TILT), sn = Math.sin(TILT);
      ctx.fillStyle = s.red > 0.5 ? "#ff9a6a" : "#ffe2b0";
      for (let i = 0; i < PARTS; i++) {
        const rr = R * s.disk * (pr[i] - (pr[i] - 0.9) * s.inward);
        if (rr < R * s.hole * 0.95) continue;
        const a = pa[i] + s.phase * ps[i] * 0.05 * (3 / pr[i]);
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr * FLAT;
        if (y < 0 && Math.abs(x) < R * s.hole) continue; // behind the hole
        ctx.globalAlpha = s.partA * (0.4 + 0.6 * (x < 0 ? 1 : 0.5));
        ctx.fillRect(CX + x * c - y * sn - 0.6, CY + x * sn + y * c - 0.6, 1.2, 1.2);
      }
    }
    if (s.pointA > 0.01) {
      ctx.save(); ctx.translate(CX, CY); ctx.scale(s.pointR, s.pointR); ctx.globalAlpha = s.pointA;
      ctx.fillStyle = grads.point; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
    }
    if (s.ripple > 0 && s.ripple < 1) {
      ctx.globalAlpha = (1 - s.ripple) * 0.5; ctx.strokeStyle = s.red > 0.5 ? "#ff453a" : "#ffcc78"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(CX, CY, 4 + s.ripple * 44, (4 + s.ripple * 44) * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }

  // timelines: elapsed ms -> frame parameters
  function connect(t, s) {
    s.pointA = ss(250, 420, t) * (1 - ss(560, 760, t)); s.pointR = 2 + 7 * ss(250, 480, t);
    s.ripple = (t - 430) / 480;
    s.hole = ss(430, 660, t); s.disk = 1; s.red = 0;
    s.ring = ss(500, 720, t) * (1 - 0.45 * ss(2000, 2450, t));
    s.sweep = ss(650, 1150, t);
    s.diskA = ss(650, 900, t) * (1 - 0.5 * ss(2000, 2450, t));
    s.lens = ss(950, 1350, t) * (1 - 0.5 * ss(2000, 2450, t));
    s.boost = 0.6 * bell(1400, 2000, t);
    s.speed = (0.6 + 0.9 * ss(650, 1200, t)) * (1 - 0.7 * ss(2000, 2450, t));
    s.partA = ss(750, 1050, t) * (1 - ss(2000, 2400, t));
    s.inward = ss(1400, 2000, t);
    s.glow = 0.8 * ss(650, 1200, t) + 0.5 * s.boost;
  }
  function disconnect(t, s) {
    const gone = ss(950, 1250, t);
    s.hole = 1 - gone; s.disk = (1 - 0.6 * ss(300, 950, t)) * (1 - gone);
    s.red = ss(300, 950, t);
    s.ring = 0.6 * (1 - ss(1050, 1350, t));
    s.sweep = 1; s.boost = 0;
    s.diskA = (0.45 + 0.35 * ss(300, 500, t)) * (1 - ss(800, 1150, t));
    s.lens = 0.5 * (1 - ss(500, 950, t));
    s.speed = 1 + 2.5 * ss(300, 800, t);
    s.partA = 0.8 * (1 - ss(800, 1000, t)); s.inward = ss(300, 950, t);
    s.pointA = ss(900, 1000, t) * (1 - ss(1150, 1350, t)); s.pointR = 5 - 4 * ss(1000, 1350, t);
    s.ripple = (t - 1000) / 380;
    s.glow = 0.5 * (1 - ss(300, 900, t));
  }

  // ---- player: deterministic states, cancellable; an opposite event interrupts cleanly ----
  // IDLE -> CONNECTING -> CHARGING_DISPLAY -> COLLAPSING -> IDLE (and the DISCONNECTING twin)
  let raf = 0, timers = [], state = "IDLE";
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  function stop() {
    cancelAnimationFrame(raf); raf = 0;
    timers.forEach(clearTimeout); timers = [];
  }

  function play(notch, kind, level) {
    stop();
    canvas ||= document.getElementById("bhCanvas");
    ctx ||= canvas.getContext("2d");
    if ((window.devicePixelRatio || 1) !== dpr || !grads) build();
    seedParticles();
    const view = notch.querySelector(".bhv"), on = kind === "on";
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const total = on ? CONNECT_MS : DISCONNECT_MS, collapseAt = COLLAPSE_AT[kind];
    const pct = Number.isFinite(level) && level >= 0 ? `${Math.round(level * 100)}%` : "—";
    document.getElementById("bhPct").textContent = pct;
    const label = document.getElementById("bhLabel");
    label.textContent = on ? "CHARGING INITIATED" : "POWER SOURCE LOST";
    view.className = `bhv ${on ? "on" : "off"}`;
    notch.classList.add("bh");
    state = on ? "CONNECTING" : "DISCONNECTING";

    // text beats
    later(on ? 1450 : 200, () => view.classList.add("show-pct"));
    later(on ? 1550 : 950, () => { if (!on) label.textContent = "RUNNING ON BATTERY"; view.classList.add("show-label"); });
    if (on) later(1400, () => view.classList.add("wave"));
    later(on ? 2000 : 950, () => { state = on ? "CHARGING_DISPLAY" : "BATTERY_DISPLAY"; });
    later(collapseAt, () => { state = "COLLAPSING"; notch.classList.remove("bh"); });
    later(total, () => { stop(); state = "IDLE"; ctx.clearRect(0, 0, canvas.width, canvas.height); view.className = "bhv"; });

    const s = { phase: 0 };
    if (reduced) { // a still frame and a fade, nothing spinning
      (on ? connect : disconnect)(on ? 2200 : 600, s); s.ripple = -1; s.pointA = 0; s.partA = 0;
      draw(s); view.classList.add("show-pct", "show-label");
      return;
    }
    const t0 = performance.now(); let last = t0;
    const frame = now => {
      const t = now - t0;
      (on ? connect : disconnect)(t, s);
      s.phase += (now - last) * 0.06 * s.speed; last = now;
      draw(s);
      raf = t < collapseAt + 380 && !notch.classList.contains("hidden") ? requestAnimationFrame(frame) : 0;
    };
    raf = requestAnimationFrame(frame);
  }

  window.BlackHole = { play, stop, get state() { return state; } };
})();
