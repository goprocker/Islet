const $ = id => document.getElementById(id);
const notch = $("notch");
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const ago = ms => { const s = Math.round(ms / 1000); return s < 5 ? "now" : s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`; };
const PLAY = '<path d="M7 4v16l13-8z"/>', PAUSE = '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>';

let track = null, lastArt = null, extras = { connected: false };
let sessions = [], pinned = null;       // Claude projects; pinned = project the user picked
let timerEnd = 0, event = null, volShownUntil = 0, volume = null;
let wx = null, dls = [];             // weather, downloads in progress
let theme = { accent: "album", idleHide: false };

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
  // over a pop-up: keep it readable and clickable instead of expanding
  if (notch.classList.contains("toast")) return;
  hoverTimer = setTimeout(() => setOpen(true), 120);
});
notch.addEventListener("mouseleave", () => {
  hovering = false;
  window.bridge.hover(false);
  clearTimeout(hoverTimer);
  // an open permission card keeps the notch open
  hoverTimer = setTimeout(() => { if (!perms.length) setOpen(false); }, 400);
});
// clicking anywhere outside takes focus from the window: shrink back to the pill
window.addEventListener("blur", () => {
  clearTimeout(hoverTimer);
  if (!perms.length) setOpen(false);
});
window.bridge.onToggle(() => {
  // hotkey cycles: pill -> open -> hidden -> pill
  if (notch.classList.contains("hidden")) notch.classList.remove("hidden");
  else if (notch.classList.contains("open")) { setOpen(false); window.BlackHole.cancel(notch); notch.classList.add("hidden"); }
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
  // grow to fit the whole message (window is 190 tall)
  notch.style.setProperty("--toast-h", Math.min(180, Math.max(62, notch.querySelector(".tmeta").scrollHeight + 20)) + "px");
  notch.classList.add("toast");
  current = t;
  const end = () => {
    // hovered pop-ups wait for the pointer to leave
    if (hovering && !notch.classList.contains("open")) { toastTimer = setTimeout(end, 500); return; }
    endToast();
  };
  toastTimer = setTimeout(end, t.ms || Math.min(12000, 4500 + 40 * (t.body || "").length)); // longer text stays longer
}
let current = null, toastTimer;
function endToast() {
  clearTimeout(toastTimer);
  current = null;
  notch.classList.remove("toast");
  setTimeout(nextToast, 450);
}
$("notch").querySelector(".toastv").addEventListener("click", () => {
  if (current?.id) window.bridge.openNotification(current.id);
  endToast();
});
const APP_COLORS = { WhatsApp: "#25d366", Discord: "#5865f2", Telegram: "#2aabee", Teams: "#5b5fc7", Outlook: "#0f6cbd", Slack: "#611f69", Chrome: "#4285f4", Edge: "#0c88d8", "Phone Link": "#0067c0" };
window.bridge.onNotification(n => toast({ ...n, color: APP_COLORS[n.app] }));

// battery: tell when the charger goes in or out, and once when it gets low
function battIcon(level, charging) {
  const w = Math.max(1, Math.round(14 * level));
  return `<svg viewBox="0 0 20 10" aria-hidden="true"><rect class="shell" x=".5" y=".5" width="16" height="9" rx="2.5"/><rect class="cap" x="17.5" y="3" width="1.5" height="4" rx=".7"/><rect class="lvl" x="1.5" y="1.5" width="${w}" height="7" rx="1.5"/>${charging ? '<path class="bolt" d="M10.2 .4 5.4 5.8h2.9L7.2 9.6 12 4.2H9.1z"/>' : ""}</svg>`;
}
let battery = null;
// plug in / unplug: black hole. Only real transitions play (first report just sets the state),
// flaky connectors are debounced, and a new event interrupts whatever is playing
let ac = null, acTimer;
window.bridge.onPower(({ ac: now }) => {
  clearTimeout(acTimer);
  acTimer = setTimeout(() => {
    if (ac === null || now === ac) { ac = now; return; }
    ac = now;
    if (theme?.powerAnim === false) return;
    if (!notch.classList.contains("hidden")) window.BlackHole.play(notch, now ? "on" : "off", battery?.level, { subtle: theme?.powerAnimStyle === "subtle" });
  }, 200);
});
navigator.getBattery?.().then(b => {
  battery = b;
  const show = () => {
    const pct = Math.round(b.level * 100);
    for (const el of [$("batt"), $("pillBatt")]) {
      el.innerHTML = `${battIcon(b.level, b.charging)}${pct}%`;
      el.classList.toggle("charging", b.charging);
      el.classList.toggle("low", !b.charging && b.level <= 0.2);
      el.title = b.charging ? `Charging, ${pct}%` : `Battery ${pct}%`;
    }
    $("batt").hidden = false;
    $("power").textContent = b.charging ? (b.level >= 1 ? "Fully charged" : "Charging") : "On battery";
    $("pillBatt").hidden = !b.charging; // pill only shows it while plugged in
    notch.classList.toggle("charging", b.charging);
  };
  show();
  b.addEventListener("chargingchange", show);
  b.addEventListener("levelchange", show);
  // one short pop on plug-in, no loop
  let popTimer;
  b.addEventListener("chargingchange", () => {
    if (!b.charging) return;
    for (const el of [$("batt"), $("pillBatt")]) el.classList.add("plugged");
    clearTimeout(popTimer);
    popTimer = setTimeout(() => { for (const el of [$("batt"), $("pillBatt")]) el.classList.remove("plugged"); }, 700);
  });
  let warned = false;
  const pct = () => `${Math.round(b.level * 100)}%`;
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
window.bridge.onSpotifyIcon(src => { src ? ($("spIcon").src = src) : $("spIcon").removeAttribute("src"); });
window.bridge.onSpotifyExtras(d => { extras = d; render(); });

window.bridge.onMedia(d => {
  const before = track ? `${track.title}|${track.artist}` : null;
  track = d.active ? { ...d, at: Date.now() } : null;
  if (track && before && before !== `${track.title}|${track.artist}`) peek(2500);
  const art = track?.art || null;
  if (art !== lastArt) {
    // a song or player without a cover, or nothing playing: don't keep the last cover
    lastArt = art;
    document.querySelectorAll(".art").forEach(a => art ? (a.src = art) : a.removeAttribute("src"));
    if (art) accentFrom(art);
    else if (theme.accent === "album") document.documentElement.style.removeProperty("--accent");
  }
  render();
});

// ---- Claude ----
const STATUS = { working: "Working", waiting: "Needs you", done: "Done" };
const keyOf = s => s.key; // agent + full project folder, set in main.js
const shown = () => sessions.find(s => keyOf(s) === pinned)
  // nothing picked: whoever needs you, else the most recent
  || sessions.find(s => s.status === "waiting") || sessions[0];
let prevStatus = {}, prevAction = "";
window.bridge.onClaude(list => {
  for (const s of list) {
    const was = prevStatus[keyOf(s)];
    if (was && was !== s.status && (s.status === "waiting" || s.status === "done")) {
      if (pinned && pinned !== keyOf(s) && s.status === "waiting") pinned = null; // jump to the one asking
      peek(4000);
    }
    prevStatus[keyOf(s)] = s.status;
  }
  sessions = list;
  renderClaude();
});
function renderClaude() {
  const s = shown();
  notch.dataset.claude = s?.status || "";
  $("cProject").textContent = s ? s.project : "Claude";
  $("cProject").disabled = !s?.cwd;
  // name the agent once both are around (or always for Codex)
  const named = s && sessions.some(x => x.agent === "codex");
  $("cStatus").textContent = s ? `${named ? (s.agent === "codex" ? "Codex · " : "Claude · ") : ""}${STATUS[s.status]}` : "";
  const ol = $("cActions");
  const first = s?.actions[0]?.action || "No activity yet";
  ol.replaceChildren(...(s ? s.actions : [{ action: first }]).map(a => Object.assign(document.createElement("li"), { textContent: a.action })));
  if (first !== prevAction) { prevAction = first; ol.firstChild.classList.add("new"); }
  const box = $("cSessions");
  box.replaceChildren(...(sessions.length > 1 ? sessions : []).map(x => {
    const b = document.createElement("button");
    b.dataset.status = x.status;
    b.setAttribute("aria-pressed", x === s);
    b.dataset.agent = x.agent;
    b.title = `${x.agent === "codex" ? "Codex" : "Claude"} · ${x.cwd || x.project}: ${STATUS[x.status]}`;
    b.append(document.createElement("i"), x.project);
    // first click picks the project, clicking the picked one opens its folder
    b.onclick = () => { if (x === shown() && x.cwd) window.bridge.openProject(x.cwd); else { pinned = keyOf(x); renderClaude(); } };
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
  if (theme.accent !== "album") return; // a fixed accent from settings wins
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

let lyricLines = null, lyricNow = "";
window.bridge.onLyrics(l => { lyricLines = l; lyricNow = ""; render(); });

function render() {
  const now = Date.now();
  // time column: clock, and under it the date, or the volume right after a scroll
  const d = new Date(), date = $("date");
  const showVol = now < volShownUntil && volume !== null;
  $("clock").textContent = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  date.textContent = showVol ? `Volume ${Math.round(volume * 100)}%` : d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  date.classList.toggle("vol", showVol);

  if (track) {
    $("title").textContent = track.title || "Unknown";
    $("artist").textContent = track.artist || "";
    // Spotify only reports position now and then; extrapolate while playing
    let pos = track.position;
    if (track.playing) pos += (now - (track.updated || track.at)) / 1000;
    pos = Math.min(Math.max(pos, 0), track.duration || 0);
    $("pos").textContent = fmt(pos); $("dur").textContent = fmt(track.duration || 0);
    $("prog").style.width = (track.duration ? pos / track.duration * 100 : 0) + "%";
    // current lyric line (slightly early so it lands with the singing)
    if (lyricLines) {
      let cur = null;
      for (const l of lyricLines) { if (l.t <= pos + 0.3) cur = l; else break; }
      lyricNow = cur ? (cur.line || "♪") : "";
    }
  } else {
    $("title").textContent = "Nothing playing";
    $("artist").textContent = "Play music in Spotify or a browser to see it here";
    $("pos").textContent = $("dur").textContent = "0:00";
    $("prog").style.width = "0";
  }
  const playing = !!track?.playing;
  $("playIcon").innerHTML = playing ? PAUSE : PLAY;
  $("play").setAttribute("aria-label", playing ? "Pause" : "Play");

  // like only works for Spotify (its shortcut or Web API)
  $("like").hidden = !track || !/spotify/i.test(track.source || "");
  const likedNow = extras.connected ? !!extras.liked : now < likeFlashUntil;
  $("like").setAttribute("aria-pressed", likedNow);
  $("like").setAttribute("aria-label", extras.connected ? (extras.liked ? "Remove from Liked Songs" : "Save to Liked Songs") : "Like or unlike in Spotify");
  $("like").title = extras.connected ? "" : "Like / unlike (sends Alt+Shift+B to Spotify)";
  // lyrics win over "up next" when the song has them
  const lyricShown = !!(lyricLines && track);
  $("upnext").textContent = lyricShown ? lyricNow : extras.next ? `Up next: ${extras.next.title} · ${extras.next.artist}` : "";
  $("upnext").classList.toggle("lyric", lyricShown);

  // right of the controls + pill chip: running timer beats the next meeting
  let side = "", chip = "", soon = false;
  if (timerEnd > now) {
    side = chip = `Timer ${fmt((timerEnd - now) / 1000)}`;
    soon = true;
  } else if (timerEnd && timerEnd <= now) {
    timerEnd = 0;
    toast({ app: "Timer", badge: "⏱", color: "#5e5ce6", title: "Time's up", body: "Your timer has finished." });
  }
  // then a download in progress
  if (!side && dls.length) {
    const d = dls[0], mb = d.bytes / 1048576;
    side = `↓ ${d.name} ${mb >= 1 ? mb.toFixed(1) + " MB" : Math.round(d.bytes / 1024) + " KB"}${dls.length > 1 ? ` +${dls.length - 1}` : ""}`;
    chip = `↓ ${mb.toFixed(0)} MB`;
    soon = true;
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
  // nothing else to say: the weather
  if (!side && wx) side = wx.error ? "" : `${wx.icon} ${wx.temp}°${wx.unit}`;
  $("side").textContent = side;
  $("side").title = wx && !wx.error ? `${wx.label}, ${wx.temp}°${wx.unit} in ${wx.place}` : wx?.error || "";
  $("side").classList.toggle("soon", soon);
  $("pillChip").textContent = chip;
  notch.classList.toggle("wide", !!chip);

  const s = shown();
  if (s) {
    $("cAgo").textContent = ago(now - s.time);
    notch.classList.toggle("live", now - s.time < 60000);
  }

  // idle: nothing playing, Claude quiet, nothing to show -> a thin line (if enabled)
  const busy = track?.playing || chip || (s && (now - s.time < 60000 || s.status === "waiting"))
    || notch.classList.contains("charging") || notch.classList.contains("bh") || $("pillPriv").childElementCount || !$("pillMoon").hasAttribute("hidden");
  notch.classList.toggle("quiet", !busy); // plain black pill, just the dot
  notch.classList.toggle("idle", theme.idleHide && !busy);
  fitPill();
}
// closed pill: as wide as what it shows, no empty black on either side
function fitPill() {
  const items = [...document.querySelector(".pill").children].filter(el => el.offsetWidth && getComputedStyle(el).visibility !== "hidden");
  const w = items.reduce((n, el) => n + el.offsetWidth, 0) + 8 * (items.length - 1) + 22; // gaps + side padding
  notch.style.setProperty("--pill-w", `${Math.max(90, Math.ceil(w))}px`);
}
setInterval(render, 500);
render();

// ---- wave from Spotify's own audio: 24 frequency bands from spotify-audio.ps1 ----
const bars = new Array(24).fill(0);
let levels = null;
window.bridge.onLevels(l => { levels = l; wakeWave(); });

function drawWave(cv, n, gap, accent) {
  const x = cv.getContext("2d"), w = cv.width, h = cv.height, bw = (w - gap * (n - 1)) / n;
  x.clearRect(0, 0, w, h);
  x.fillStyle = accent;
  for (let k = 0; k < n; k++) {
    // average the bands that fall under this bar
    const a = Math.floor(k * bars.length / n), b = Math.floor((k + 1) * bars.length / n);
    let v = 0;
    for (let j = a; j < b; j++) v += bars[j];
    const bh = Math.max(0.1, v / (b - a)) * h;
    x.beginPath(); x.roundRect(k * (bw + gap), (h - bh) / 2, bw, bh, bw / 2); x.fill();
  }
}
// runs only while the bars move; once they settle it stops, and render() / new levels
// start it again. Each canvas is redrawn only when shown and out of date.
const waves = [[$("mini"), 6], [$("wave"), 7]];
let waveRunning = false, waveVersion = 0;
function wakeWave() {
  if (!waveRunning) { waveRunning = true; requestAnimationFrame(frame); }
}
function frame() {
  const live = !!track?.playing && !!levels;
  let moved = false;
  for (let k = 0; k < bars.length; k++) {
    const target = live ? Math.pow(levels[k] / 255, 1.4) : 0;
    const next = Math.abs(target - bars[k]) < 1e-3 ? target : bars[k] + (target - bars[k]) * 0.35;
    if (next !== bars[k]) { bars[k] = next; moved = true; }
  }
  if (moved) waveVersion++;
  if (!notch.classList.contains("hidden")) {
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent");
    for (const [cv, n] of waves) {
      if (!cv.offsetWidth || (cv.drawn === waveVersion && cv.accent === accent)) continue;
      drawWave(cv, n, 3, accent);
      cv.drawn = waveVersion; cv.accent = accent;
    }
  }
  if (moved || live) requestAnimationFrame(frame);
  else waveRunning = false;
}
wakeWave();
setInterval(wakeWave, 500); // playback and accent changes
new MutationObserver(wakeWave).observe(notch, { attributes: true, attributeFilter: ["class"] }); // open / closed / hidden

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

// ---- album view ----
$("artBtn").addEventListener("click", () => { if (track?.art) { $("albumv").hidden = false; renderAlbum(); } });
$("albumv").addEventListener("click", () => { $("albumv").hidden = true; });
// closes with the notch so it doesn't reappear on next hover
new MutationObserver(() => { if (!notch.classList.contains("open")) $("albumv").hidden = true; })
  .observe(notch, { attributes: true, attributeFilter: ["class"] });
function renderAlbum() {
  if ($("albumv").hidden || !track) return;
  $("albumv").querySelectorAll("img").forEach(i => { if (i.src !== track.art) i.src = track.art; });
  $("aTitle").textContent = track.title || "";
  $("aArtist").textContent = track.artist || "";
  $("aLyric").textContent = lyricLines ? lyricNow : "";
}
setInterval(renderAlbum, 500);

// ---- Do Not Disturb ----
window.bridge.onDnd(on => {
  $("dndBtn").setAttribute("aria-pressed", on);
  $("dndBtn").title = on ? "Do Not Disturb is on. Click to turn off." : "Do Not Disturb: pause notification pop-ups";
  $("pillMoon").toggleAttribute("hidden", !on); // svg has no .hidden property
});
$("dndBtn").onclick = () => window.bridge.toggleDnd();

// ---- tools panels: clipboard history and file shelf (one at a time) ----
const PANELS = { clipBtn: "clipPanel", shelfBtn: "shelfPanel" };
function showPanel(btnId) {
  for (const [b, p] of Object.entries(PANELS)) {
    const on = b === btnId && $(p).hidden;
    $(p).hidden = !on;
    $(b).setAttribute("aria-pressed", on);
  }
}
for (const b of Object.keys(PANELS)) $(b).onclick = () => showPanel(b);
// panels close with the notch
new MutationObserver(() => { if (!notch.classList.contains("open")) showPanel(null); })
  .observe(notch, { attributes: true, attributeFilter: ["class"] });

window.bridge.onClipboard(list => {
  $("clipEmpty").hidden = list.length > 0;
  $("clipList").replaceChildren(...list.map((text, i) => {
    const li = document.createElement("li"), b = document.createElement("button");
    b.textContent = text;
    b.title = "Copy again";
    b.onclick = () => { window.bridge.copyClip(i); b.textContent = "Copied"; setTimeout(() => (b.textContent = text), 900); };
    li.append(b);
    return li;
  }));
});
$("clipClear").onclick = () => window.bridge.clearClips();

window.bridge.onShelf(files => {
  $("shelfEmpty").hidden = files.length > 0;
  $("shelfList").replaceChildren(...files.map(f => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.className = "file";
    b.draggable = true;
    b.title = `${f.name}\nDrag out to use it, double-click to show in folder`;
    if (f.icon) b.append(Object.assign(document.createElement("img"), { src: f.icon, alt: "" }));
    b.append(Object.assign(document.createElement("span"), { textContent: f.name }));
    b.ondragstart = e => { e.preventDefault(); window.bridge.shelfDrag(f.path); };
    b.ondblclick = () => window.bridge.shelfOpen(f.path);
    const x = Object.assign(document.createElement("button"), { className: "x", textContent: "✕", title: `Remove ${f.name} from shelf` });
    x.onclick = () => window.bridge.shelfRemove(f.path);
    li.append(b, x);
    return li;
  }));
});
$("shelfAddBtn").onclick = () => window.bridge.shelfPick();
// dropping files anywhere on the notch opens it on the shelf and adds them
notch.addEventListener("dragover", e => {
  if (![...e.dataTransfer.types].includes("Files")) return;
  e.preventDefault();
  if (!notch.classList.contains("open")) setOpen(true);
  if ($("shelfPanel").hidden) showPanel("shelfBtn");
  $("shelfPanel").classList.add("dropping");
});
notch.addEventListener("dragleave", () => $("shelfPanel").classList.remove("dropping"));
notch.addEventListener("drop", e => {
  e.preventDefault();
  $("shelfPanel").classList.remove("dropping");
  if (e.dataTransfer.files.length) window.bridge.shelfAddFiles(e.dataTransfer.files);
});

// ---- weather + downloads ----
window.bridge.onWeather(w => { wx = w; render(); });
window.bridge.onDownloads(list => { dls = list; render(); });
window.bridge.onDownloadDone(d => toast({ id: d.id, app: "Downloads", badge: "↓", color: "#0a84ff", title: d.name, body: "Downloaded. Click to show in folder." }));

// ---- look ----
window.bridge.onTheme(t => {
  theme = t;
  if (t.accent !== "album") document.documentElement.style.setProperty("--accent", t.accent);
  else if (track?.art) accentFrom(track.art);
  else document.documentElement.style.removeProperty("--accent");
  render();
});
