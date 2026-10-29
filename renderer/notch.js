const $ = id => document.getElementById(id);
const notch = $("notch");
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const ago = ms => { const s = Math.round(ms / 1000); return s < 5 ? "now" : s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`; };
const PLAY = '<path d="M7 4v16l13-8z"/>', PAUSE = '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>';

let track = null, lastArt = null, extras = { connected: false };
let sessions = [], pinned = null;       // Claude projects; pinned = project the user picked
let timerEnd = 0, event = null, volShownUntil = 0, volume = null;

// ---- open / close; window is click-through except over the notch ----
function setOpen(o) { notch.classList.toggle("open", o); notch.setAttribute("aria-expanded", o); }
notch.addEventListener("keydown", e => {
  if (e.key === "Escape") setOpen(false);
  if (e.target === notch && (e.key === "Enter" || e.key === " ")) setOpen(!notch.classList.contains("open"));
});
// hover opens; short delays stop it flickering when the pointer just passes by
let hoverTimer, hovering = false;
notch.addEventListener("mouseenter", () => {
  hovering = true;
  window.bridge.hover(true);
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => setOpen(true), 120);
});
notch.addEventListener("mouseleave", () => {
  hovering = false;
  window.bridge.hover(false);
  clearTimeout(hoverTimer);
  // an open permission card keeps the notch open
  hoverTimer = setTimeout(() => { if (!perms.length) setOpen(false); }, 400);
});
window.bridge.onToggle(() => {
  // hotkey cycles: pill -> open -> hidden -> pill
  if (notch.classList.contains("hidden")) notch.classList.remove("hidden");
  else if (notch.classList.contains("open")) { setOpen(false); notch.classList.add("hidden"); }
  else setOpen(true);
});

// open briefly on its own (new song, Claude needs you), unless hidden or already in use
function peek(ms) {
  if (notch.classList.contains("hidden") || hovering) return;
  setOpen(true);
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => { if (!hovering && !perms.length) setOpen(false); }, ms);
}

// ---- toasts: notifications, battery, timer; one at a time ----
const toasts = [];
let toastBusy = false;
function toast(t) { toasts.push(t); if (!toastBusy) nextToast(); }
function nextToast() {
  const t = toasts.shift();
  if (!t || notch.classList.contains("hidden")) { toastBusy = false; notch.classList.remove("toast"); return; }
  toastBusy = true;
  // real app logo when we have one, else a coloured letter / emoji badge
  const badge = $("tBadge");
  if (t.icon) {
    badge.replaceChildren(Object.assign(document.createElement("img"), { src: t.icon, alt: "" }));
    badge.style.background = "transparent";
  } else {
    badge.textContent = t.badge || (t.app || "?")[0].toUpperCase();
    badge.style.background = t.color || "";
  }
  $("tApp").textContent = t.app || "";
  $("tTitle").textContent = t.title || "";
  $("tBody").textContent = t.body || "";
  notch.classList.add("toast");
  setTimeout(() => { notch.classList.remove("toast"); setTimeout(nextToast, 450); }, t.ms || 4500);
}
const APP_COLORS = { WhatsApp: "#25d366", Discord: "#5865f2", Telegram: "#2aabee", Teams: "#5b5fc7", Outlook: "#0f6cbd", Slack: "#611f69", Chrome: "#4285f4", Edge: "#0c88d8", "Phone Link": "#0067c0" };
window.bridge.onNotification(n => toast({ ...n, color: APP_COLORS[n.app] }));

// battery: tell when the charger goes in or out, and once when it gets low
function battIcon(level, charging) {
  const w = Math.max(1, Math.round(14 * level));
  return `<svg viewBox="0 0 20 10" aria-hidden="true"><rect class="shell" x=".5" y=".5" width="16" height="9" rx="2.5"/><rect class="cap" x="17.5" y="3" width="1.5" height="4" rx=".7"/><rect class="lvl" x="1.5" y="1.5" width="${w}" height="7" rx="1.5"/>${charging ? '<path class="bolt" d="M9.6 1.2 6 5.6h2.4L7.6 8.8 11.2 4.4H8.8z"/>' : ""}</svg>`;
}
navigator.getBattery?.().then(b => {
  const show = () => {
    const pct = Math.round(b.level * 100);
    for (const el of [$("batt"), $("pillBatt")]) {
      el.innerHTML = `${battIcon(b.level, b.charging)}${pct}%`;
      el.classList.toggle("charging", b.charging);
      el.classList.toggle("low", !b.charging && b.level <= 0.2);
      el.title = b.charging ? `Charging, ${pct}%` : `Battery ${pct}%`;
    }
    $("batt").hidden = false;
    $("pillBatt").hidden = !b.charging; // pill only shows it while plugged in
    notch.classList.toggle("charging", b.charging);
  };
  show();
  b.addEventListener("chargingchange", show);
  b.addEventListener("levelchange", show);
  let warned = false;
  const pct = () => `${Math.round(b.level * 100)}%`;
  b.addEventListener("chargingchange", () => toast(b.charging
    ? { app: "Battery", badge: "⚡", color: "#30a14e", title: "Charging", body: pct() }
    : { app: "Battery", badge: "🔋", title: "On battery", body: pct() }));
  b.addEventListener("levelchange", () => {
    if (!b.charging && b.level <= 0.2 && !warned) { warned = true; toast({ app: "Battery", badge: "!", color: "#d1453b", title: "Battery low", body: `${pct()} left. Plug in soon.` }); }
    if (b.level > 0.25) warned = false;
  });
});

// ---- timer + calendar ----
window.bridge.onTimer(end => { timerEnd = end; render(); });
window.bridge.onCalendar(ev => { event = ev; render(); });
let eventPeeked = null;

// ---- music ----
$("seekArea").onclick = e => {
  if (!track?.duration) return;
  const r = $("seekArea").getBoundingClientRect();
  const sec = (e.clientX - r.left) / r.width * track.duration;
  window.bridge.seek(sec);
  Object.assign(track, { position: sec, updated: Date.now() });
  render();
};
$("play").onclick = () => { window.bridge.control("toggle"); if (track) { track.playing = !track.playing; render(); } };
$("next").onclick = () => window.bridge.control("next");
$("prev").onclick = () => window.bridge.control("prev");
let likeFlashUntil = 0;
$("like").onclick = () => {
  if (extras.connected) extras.liked = !extras.liked;
  else likeFlashUntil = Date.now() + 1200; // shortcut mode can't read liked state: just confirm the press
  render();
  window.bridge.like();
};
// scroll over the music side: Spotify's own volume, not the system's
$("music").addEventListener("wheel", e => {
  e.preventDefault();
  window.bridge.volume(e.deltaY < 0 ? 0.05 : -0.05);
}, { passive: false });
window.bridge.onVolume(v => { volume = v; volShownUntil = Date.now() + 1500; render(); });
window.bridge.onSpotifyIcon(src => { $("spIcon").src = src; });
window.bridge.onSpotifyExtras(d => { extras = d; render(); });

window.bridge.onMedia(d => {
  const before = track ? `${track.title}|${track.artist}` : null;
  track = d.active ? { ...d, at: Date.now() } : null;
  if (track && before && before !== `${track.title}|${track.artist}`) peek(2500);
  if (track && track.art && track.art !== lastArt) {
    lastArt = track.art;
    document.querySelectorAll(".art").forEach(a => a.src = track.art);
    accentFrom(track.art);
  }
  render();
});

// ---- Claude ----
const STATUS = { working: "Working", waiting: "Needs you", done: "Done" };
const shown = () => sessions.find(s => s.project === pinned)
  // nothing picked: whoever needs you, else the most recent
  || sessions.find(s => s.status === "waiting") || sessions[0];
let prevStatus = {}, prevAction = "";
window.bridge.onClaude(list => {
  for (const s of list) {
    const was = prevStatus[s.project];
    if (was && was !== s.status && (s.status === "waiting" || s.status === "done")) {
      if (pinned && pinned !== s.project && s.status === "waiting") pinned = null; // jump to the one asking
      peek(4000);
    }
    prevStatus[s.project] = s.status;
  }
  sessions = list;
  renderClaude();
});
function renderClaude() {
  const s = shown();
  notch.dataset.claude = s?.status || "";
  $("cProject").textContent = s ? s.project : "Claude";
  $("cProject").disabled = !s?.cwd;
  $("cStatus").textContent = s ? STATUS[s.status] : "";
  const ol = $("cActions");
  const first = s?.actions[0]?.action || "No activity yet";
  ol.replaceChildren(...(s ? s.actions : [{ action: first }]).map(a => Object.assign(document.createElement("li"), { textContent: a.action })));
  if (first !== prevAction) { prevAction = first; ol.firstChild.classList.add("new"); }
  const box = $("cSessions");
  box.replaceChildren(...(sessions.length > 1 ? sessions : []).map(x => {
    const b = document.createElement("button");
    b.dataset.status = x.status;
    b.setAttribute("aria-pressed", x === s);
    b.title = `${x.project}: ${STATUS[x.status]}`;
    b.append(document.createElement("i"), x.project);
    // first click picks the project, clicking the picked one opens its folder
    b.onclick = () => { if (x === shown() && x.cwd) window.bridge.openProject(x.cwd); else { pinned = x.project; renderClaude(); } };
    return b;
  }));
  $("cSessions").closest(".claude").classList.toggle("multi", sessions.length > 1);
  render();
}
// ---- permission requests from Claude Code hooks: Allow / Deny right here ----
const perms = [];
function showPerm() {
  const p = perms[0];
  notch.classList.toggle("has-perm", !!p);
  $("perm").hidden = !p;
  if (!p) { if (!hovering) setOpen(false); return; }
  pinned = null;
  $("permTool").textContent = `Allow ${p.tool}${p.project ? ` in ${p.project}` : ""}?`;
  $("permDetail").textContent = p.detail;
  clearTimeout(hoverTimer);
  if (!notch.classList.contains("hidden")) setOpen(true); // stays open until answered
}
function answerPerm(decision) {
  const p = perms.shift();
  if (p) window.bridge.answerPermission(p.id, decision);
  showPerm();
}
$("permAllow").onclick = () => answerPerm("allow");
$("permDeny").onclick = () => answerPerm("deny");
window.bridge.onPermission(p => { perms.push(p); showPerm(); });
window.bridge.onPermissionGone(id => {
  const i = perms.findIndex(p => p.id === id);
  if (i >= 0) { perms.splice(i, 1); showPerm(); }
});

$("cProject").onclick =() => { const s = shown(); if (s?.cwd) window.bridge.openProject(s.cwd); };

// tint the notch with the album art's dominant colour
function accentFrom(src) {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas"); c.width = c.height = 16;
    const x = c.getContext("2d"); x.drawImage(img, 0, 0, 16, 16);
    const d = x.getImageData(0, 0, 16, 16).data;
    let best = [200, 200, 200], score = -1;
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const s = (mx - mn) * (mx / 255);
      if (s > score) { score = s; best = [r, g, b]; }
    }
    const k = 200 / Math.max(...best, 1);
    const [r, g, b] = best.map(v => Math.min(255, Math.round(v * Math.max(1, k))));
    document.documentElement.style.setProperty("--accent", `rgb(${r},${g},${b})`);
  };
  img.src = src;
}

function render() {
  const now = Date.now();
  // left of the controls: clock, or the volume right after a scroll
  const clock = $("clock");
  const showVol = now < volShownUntil && volume !== null;
  clock.textContent = showVol ? `Volume ${Math.round(volume * 100)}%` : new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  clock.classList.toggle("vol", showVol);

  if (track) {
    $("title").textContent = track.title || "Unknown";
    $("artist").textContent = track.artist || "";
    // Spotify only reports position now and then; extrapolate while playing
    let pos = track.position;
    if (track.playing) pos += (now - (track.updated || track.at)) / 1000;
    pos = Math.min(Math.max(pos, 0), track.duration || 0);
    $("pos").textContent = fmt(pos); $("dur").textContent = fmt(track.duration || 0);
    $("prog").style.width = (track.duration ? pos / track.duration * 100 : 0) + "%";
  } else {
    $("title").textContent = "Nothing playing";
    $("artist").textContent = "Open Spotify to see what's playing";
    $("pos").textContent = $("dur").textContent = "0:00";
    $("prog").style.width = "0";
  }
  const playing = !!track?.playing;
  $("playIcon").innerHTML = playing ? PAUSE : PLAY;
  $("play").setAttribute("aria-label", playing ? "Pause" : "Play");

  $("like").hidden = !track;
  const likedNow = extras.connected ? !!extras.liked : now < likeFlashUntil;
  $("like").setAttribute("aria-pressed", likedNow);
  $("like").setAttribute("aria-label", extras.connected ? (extras.liked ? "Remove from Liked Songs" : "Save to Liked Songs") : "Like or unlike in Spotify");
  $("like").title = extras.connected ? "" : "Like / unlike (sends Alt+Shift+B to Spotify)";
  $("upnext").textContent = extras.next ? `Up next: ${extras.next.title} · ${extras.next.artist}` : "";

  // right of the controls + pill chip: running timer beats the next meeting
  let side = "", chip = "", soon = false;
  if (timerEnd > now) {
    side = chip = `Timer ${fmt((timerEnd - now) / 1000)}`;
    soon = true;
  } else if (timerEnd && timerEnd <= now) {
    timerEnd = 0;
    toast({ app: "Timer", badge: "⏱", color: "#5e5ce6", title: "Time's up", body: "Your timer has finished." });
  }
  if (!side && event) {
    const mins = Math.round((event.start - now) / 60000);
    if (mins < -5) event = null;
    else {
      const when = mins <= 0 ? "now" : mins < 60 ? `in ${mins}m` : new Date(event.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      side = `${event.title} ${when}`;
      soon = mins <= 15;
      if (soon) chip = `${event.title} ${when}`;
      if (mins <= 5 && eventPeeked !== event.start) { eventPeeked = event.start; toast({ app: "Calendar", badge: "📅", color: "#e8453c", title: event.title, body: mins <= 0 ? "Starting now" : `Starts in ${mins} min` }); }
    }
  }
  $("side").textContent = side;
  $("side").classList.toggle("soon", soon);
  $("pillChip").textContent = chip;
  notch.classList.toggle("wide", !!chip);

  const s = shown();
  if (s) {
    $("cAgo").textContent = ago(now - s.time);
    notch.classList.toggle("live", now - s.time < 60000);
  }
}
setInterval(render, 500);
render();

// ---- wave from Spotify's own audio: 24 frequency bands from spotify-audio.ps1 ----
const bars = new Array(24).fill(0);
let levels = null;
window.bridge.onLevels(l => { levels = l; });

function drawWave(cv, n, gap) {
  const x = cv.getContext("2d"), w = cv.width, h = cv.height, bw = (w - gap * (n - 1)) / n;
  x.clearRect(0, 0, w, h);
  x.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent");
  for (let k = 0; k < n; k++) {
    // average the bands that fall under this bar
    const a = Math.floor(k * bars.length / n), b = Math.floor((k + 1) * bars.length / n);
    let v = 0;
    for (let j = a; j < b; j++) v += bars[j];
    const bh = Math.max(0.1, v / (b - a)) * h;
    x.beginPath(); x.roundRect(k * (bw + gap), (h - bh) / 2, bw, bh, bw / 2); x.fill();
  }
}
(function frame() {
  const playing = !!track?.playing;
  for (let k = 0; k < bars.length; k++) {
    const target = playing && levels ? Math.pow(levels[k] / 255, 1.4) : 0;
    bars[k] += (target - bars[k]) * 0.35;
  }
  drawWave($("mini"), 6, 3); drawWave($("wave"), 7, 3);
  requestAnimationFrame(frame);
})();

// ---- mic / camera / screen capture in use ----
window.bridge.onSystem(d => {
  const kinds = [["mic", "Microphone", d.mic], ["cam", "Camera", d.cam], ["screen", "Screen capture", d.screen]];
  for (const box of [$("pillPriv"), $("priv")]) {
    box.replaceChildren(...kinds.filter(([, , apps]) => apps?.length).map(([cls, label, apps]) => {
      const i = document.createElement("i");
      i.className = cls;
      i.title = `${label} in use: ${apps.join(", ")}`;
      return i;
    }));
  }
});
