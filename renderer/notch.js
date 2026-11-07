const $ = id => document.getElementById(id);
const notch = $("notch");
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const ago = ms => { const s = Math.round(ms / 1000); return s < 5 ? "now" : s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`; };
const PLAY = '<path d="M8 5v14l11-7z"/>', PAUSE = '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>';

let track = null, lastArt = null, extras = { connected: false };
let sessions = [], pinned = null;       // Claude projects; pinned = project the user picked
let timerEnd = 0, timerLabel = "Timer", stopwatchStart = 0, event = null, volShownUntil = 0, volume = null;
let wx = null, dls = [];             // weather, downloads in progress
let theme = { accent: "album", idleHide: false };

// ---- open / close; window is click-through except over the notch ----
function setOpen(o) { notch.classList.toggle("open", o); notch.setAttribute("aria-expanded", o); }
// the cat talks in the closed pill: a hello when Islet starts (by time of day on the first one each day),
// a line when its mood changes, and now and then while idle; the pill widens for the text, then shrinks back
const SAY_MS = 6000, CHAT_EVERY = 10 * 60000;
let lastSaid = 0, saidMood = "", sayTimer;
function petSay(mood, hello) {
  if (theme.pet === false) return;
  const today = new Date().toDateString(), firstToday = hello && localStorage.getItem("petHello") !== today;
  if (firstToday) localStorage.setItem("petHello", today);
  $("pillSay").textContent = window.Pet.line({ hour: new Date().getHours(), name: theme.name, mood: hello ? "" : mood, firstToday });
  lastSaid = Date.now();
  notch.classList.add("talking");
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => { notch.classList.remove("talking"); render(); }, SAY_MS);
  render();
}
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
  window.bridge.hover(hovering); // the hotkey made the window take mouse clicks; back to click-through unless the pointer is on it
  clearTimeout(hoverTimer);
  if (!perms.length) setOpen(false);
});
window.bridge.onToggle(() => {
  // hotkey cycles: pill -> open -> hidden -> pill
  if (notch.classList.contains("hidden")) { notch.classList.remove("hidden"); if (!toastBusy) nextToast(); } // pop-ups held back while hidden
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
// while hidden they wait for the notch to come back; only the latest few are kept for then
const HIDDEN_BACKLOG = 5;
const toasts = [];
let toastBusy = false;
let lastToastAt = 0, quietSince = 0;
function toast(t) {
  if (!t.hud) lastToastAt = Date.now();
  if (t.hud) {
    // the HUD follows the key presses: queued ones are stale, and a HUD already on screen is redrawn in place
    for (let i = toasts.length - 1; i >= 0; i--) if (toasts[i].hud) toasts.splice(i, 1);
    if (current?.hud) { toasts.unshift(t); clearTimeout(toastTimer); nextToast(); return; }
  }
  toasts.push(t);
  if (notch.classList.contains("hidden") && toasts.length > HIDDEN_BACKLOG) toasts.shift();
  if (!toastBusy) nextToast();
}
function nextToast() {
  if (!toasts.length || notch.classList.contains("hidden")) { toastBusy = false; notch.classList.remove("toast"); return; }
  const t = toasts.shift();
  toastBusy = true;
  // real app logo when we have one, else a coloured letter / emoji badge
  const badge = $("tBadge");
  if (t.svg) { // our own inline icon, never message text
    badge.innerHTML = t.svg;
    badge.style.background = t.color || "";
  } else if (t.icon) {
    badge.replaceChildren(Object.assign(document.createElement("img"), { src: t.icon, alt: "" }));
    badge.style.background = "transparent";
  } else {
    badge.textContent = t.badge || (t.app || "?")[0].toUpperCase();
    badge.style.background = t.color || "";
  }
  $("tApp").textContent = t.app || "";
  $("tTitle").textContent = t.title || "";
  $("tBody").textContent = t.body || "";
  $("tBar").hidden = t.bar == null; // volume / brightness HUD level
  if (t.bar != null) $("tFill").style.width = Math.round(t.bar * 100) + "%";
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
  if (current?.update) window.bridge.installUpdate();
  else if (current?.link) window.bridge.joinMeeting(current.link);
  else if (current?.id) window.bridge.openNotification(current.id);
  endToast();
});
const APP_COLORS = { WhatsApp: "#25d366", Discord: "#5865f2", Telegram: "#2aabee", Teams: "#5b5fc7", Outlook: "#0f6cbd", Slack: "#611f69", Chrome: "#4285f4", Edge: "#0c88d8", "Phone Link": "#0067c0" };
// volume / brightness HUD: the notch takes over from the Windows overlay
const HUD_SPEAKER = '<path class="fill" d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/>';
const hudSvg = body => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const HUD_ICONS = {
  low: hudSvg(HUD_SPEAKER + '<path d="M15.2 9.6a3.4 3.4 0 0 1 0 4.8"/>'),
  high: hudSvg(HUD_SPEAKER + '<path d="M15.2 9.6a3.4 3.4 0 0 1 0 4.8M17.8 7a7 7 0 0 1 0 10"/>'),
  mute: hudSvg(HUD_SPEAKER + '<path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  mic: hudSvg('<rect class="fill" x="9" y="3.5" width="6" height="10.5" rx="3"/><path d="M6 11.5a6 6 0 0 0 12 0M12 17.5v3"/>'),
  micOff: hudSvg('<rect class="fill" x="9" y="3.5" width="6" height="10.5" rx="3"/><path d="M6 11.5a6 6 0 0 0 12 0M12 17.5v3M4 4l16 16"/>'),
  brightness: hudSvg('<circle cx="12" cy="12" r="3.6"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M6 18l1.4-1.4M16.6 7.4L18 6"/>'),
};
window.bridge.onVolumeHud(h => {
  if (notch.classList.contains("hidden")) return;
  const pct = Math.round(h.level * 100);
  if (h.kind === "mic") { // no level bar: it is only on or off
    toast({ hud: "mic", app: "Microphone", svg: h.muted ? HUD_ICONS.micOff : HUD_ICONS.mic, color: h.muted ? "#5c2323" : "#3a3a3c", title: h.muted ? "Microphone muted" : "Microphone on", ms: 1600 });
    return;
  }
  const icon = h.kind === "brightness" ? HUD_ICONS.brightness : h.muted || pct === 0 ? HUD_ICONS.mute : pct < 40 ? HUD_ICONS.low : HUD_ICONS.high;
  const title = h.kind === "mute" ? (h.muted ? "Muted" : "Unmuted") : h.kind === "brightness" ? `Brightness ${pct}%` : h.muted ? "Muted" : `Volume ${pct}%`;
  toast({ hud: h.kind === "brightness" ? "brightness" : "volume", app: h.kind === "brightness" ? "Display" : "Sound", svg: icon, color: "#3a3a3c", title, bar: h.muted ? 0 : h.level, ms: 1600 });
});
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
// a focus phase that ends (Pomodoro moves on to a break, or a focus timer runs out) grows the pet's plant
let plantUntil = 0, plantedEnd = 0; // plantedEnd: the timer that already grew one
const PLANT_MS = 10000;
function growPlant() {
  if (timerEnd === plantedEnd) return;
  plantedEnd = timerEnd;
  const today = new Date().toDateString();
  let n = 0;
  try { const p = JSON.parse(localStorage.getItem("petPlant") || "{}"); n = p.day === today ? p.n : 0; } catch {}
  n = Math.min(n + 1, 4);
  try { localStorage.setItem("petPlant", JSON.stringify({ day: today, n })); } catch {}
  for (const p of [$("pillPet"), $("fullPet")]) p.dataset.plant = n;
  plantUntil = Date.now() + PLANT_MS;
  render();
}
window.bridge.onTimerLabel(l => {
  if (/focus/i.test(timerLabel) && !/focus/i.test(l || "") && timerEnd && timerEnd <= Date.now() + 2000) growPlant();
  timerLabel = l || "Timer";
});
window.bridge.onStopwatch(t => { stopwatchStart = t || 0; render(); });
let sideLink = null; // the meeting the right-hand text would join
$("side").onclick = () => { if (sideLink) window.bridge.joinMeeting(sideLink); };
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
// ---- keyboard sliders: same bridge calls as the mouse ----
const shownPos = (now = Date.now()) => {
  let pos = track.position;
  if (track.playing) pos += (now - (track.updated || track.at)) / 1000; // Spotify only reports it now and then
  return Math.min(Math.max(pos, 0), track.duration || 0);
};
const canChangeVolume = () => /spotify/i.test(track?.source || ""); // volume is Spotify's own
let seekSend;
$("seekArea").onkeydown = e => {
  if (!track?.duration) return;
  const delta = window.Sliders.sliderDelta(e.key, 5, 30, track.duration);
  if (delta === null) return;
  e.preventDefault();
  const sec = Math.min(Math.max(shownPos() + delta, 0), track.duration);
  Object.assign(track, { position: sec, updated: Date.now() });
  render();
  // each seek starts a PowerShell, so a held key sends only where it ends
  clearTimeout(seekSend);
  seekSend = setTimeout(() => window.bridge.seek(sec), 200);
};
$("volArea").onkeydown = e => {
  if (!canChangeVolume()) return;
  const delta = window.Sliders.sliderDelta(e.key, 0.05, 0.2, 1);
  if (delta === null) return;
  e.preventDefault();
  window.bridge.volume(delta); // the helper keeps it within 0..1
};
$("volArea").onfocus = () => { if (canChangeVolume()) window.bridge.volume(0); }; // reads the current level
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
  if (canChangeVolume()) window.bridge.volume(e.deltaY < 0 ? 0.05 : -0.05);
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
    else {
      accentRequest++; // the cover still loading no longer applies
      if (theme.accent === "album") document.documentElement.style.removeProperty("--accent");
    }
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
  $("permDetail").parentElement.scrollTop = 0;
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
let accentRequest = 0; // only the newest cover may set it
function accentFrom(src) {
  const mine = ++accentRequest;
  if (theme.accent !== "album") return; // a fixed accent from settings wins
  const img = new Image();
  img.onload = () => {
    if (mine !== accentRequest || theme.accent !== "album") return; // changed while it loaded
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
    const pos = shownPos(now);
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
  window.Sliders.syncSeek($("seekArea"), track ? shownPos(now) : 0, track?.duration || 0);
  window.Sliders.syncVolume($("volArea"), volume, canChangeVolume());
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
  let side = "", chip = "", soon = false, joinable = null;
  if (timerEnd > now) {
    side = chip = `${timerLabel} ${fmt((timerEnd - now) / 1000)}`;
    soon = true;
  } else if (timerEnd && timerEnd <= now) {
    timerEnd = 0;
    toast({ app: "Timer", badge: "⏱", color: "#5e5ce6", title: "Time's up", body: `${timerLabel} has finished.` });
  }
  // a running stopwatch counts up when no timer is on
  if (!side && stopwatchStart) {
    side = chip = `⏱ ${fmt((now - stopwatchStart) / 1000)}`;
    soon = true;
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
      if (event.link && mins <= 10) { joinable = event.link; side = `Join ${when}`; } // the Join link appears 10 minutes ahead
      soon = mins <= 15;
      if (soon) chip = `${event.title} ${when}`;
      if (mins <= 5 && eventPeeked !== event.start) { eventPeeked = event.start; toast({ app: "Calendar", badge: "📅", color: "#e8453c", title: event.title, body: mins <= 0 ? "Starting now" : `Starts in ${mins} min`, link: event.link && mins <= 10 ? event.link : undefined }); }
    }
  }
  // nothing else to say: the weather
  if (!side && wx) side = wx.error ? "" : `${wx.icon} ${wx.temp}°${wx.unit}`;
  $("side").textContent = side;
  $("side").title = joinable ? `Join ${event.title}` : wx && !wx.error ? `${wx.label}, ${wx.temp}°${wx.unit} in ${wx.place}` : wx?.error || "";
  $("side").classList.toggle("soon", soon);
  $("side").classList.toggle("join", !!joinable);
  sideLink = joinable;
  $("pillChip").textContent = chip;
  notch.classList.toggle("wide", !!chip);

  const s = shown();
  if (s) {
    $("cAgo").textContent = ago(now - s.time);
    notch.classList.toggle("live", now - s.time < 60000);
  }

  // idle: nothing playing, Claude quiet, nothing to show -> a thin line (if enabled)
  const busy = track?.playing || chip || (s && (now - s.time < 60000 || s.status === "waiting"))
    || notch.classList.contains("talking") || notch.classList.contains("charging") || notch.classList.contains("bh") || $("pillPriv").childElementCount || !$("pillMoon").hasAttribute("hidden");
  notch.classList.toggle("quiet", !busy); // plain black pill, just the dot
  notch.classList.toggle("playing", !!track?.playing);
  notch.classList.toggle("eq", !!track?.playing && now - loudAt < 3000); // the little equalizer shows only while sound comes out
  notch.classList.toggle("idle", theme.idleHide && !busy);
  updatePet(now, busy);
  fitPill();
}
// the pet: its mood follows music, the focus timer, pop-ups, a low battery, and how long nothing has happened
function updatePet(now, busy) {
  const pets = [$("pillPet"), $("fullPet")];
  for (const p of pets) p.hidden = theme.pet === false;
  if (theme.pet === false) return;
  if (busy) quietSince = 0; else if (!quietSince) quietSince = now;
  if (timerEnd && timerEnd <= now && /focus/i.test(timerLabel)) growPlant(); // a focus timer ran out
  // agents: one asking for you beats one working; a "working" session that went quiet over 2 minutes ago doesn't count
  const agent = sessions.some(x => x.status === "waiting") ? "waiting" : sessions.some(x => x.status === "working" && now - x.time < 120000) ? "working" : "";
  const mood = window.Pet.pick({ now, battery, toastAt: lastToastAt, timerEnd, timerLabel, playing: !!track?.playing, quietSince, agent, plantUntil, app: fgApp });
  window.Pet.paint(pets, mood, theme.petPack);
  // hello once the name has arrived; then a word on each new mood (not the 4-second pop-up startle), or a chat after a quiet spell
  if (!saidMood) { if (theme.name !== undefined) { saidMood = mood; petSay(mood, true); } }
  else if (mood !== saidMood && mood !== "alert") { saidMood = mood; petSay(mood); }
  else if (now - lastSaid > CHAT_EVERY && !notch.classList.contains("open")) petSay(mood);
}
// closed pill: as wide as what it shows, no empty black on either side
let fittedPillWidth = 0;
function fitPill() {
  const items = [...document.querySelector(".pill").children].filter(el => el.offsetWidth && getComputedStyle(el).visibility !== "hidden");
  const w = items.reduce((n, el) => n + el.offsetWidth, 0) + 8 * (items.length - 1) + 22; // gaps + side padding
  const next = Math.max(90, Math.ceil(w));
  if (next !== fittedPillWidth) {
    fittedPillWidth = next;
    notch.style.setProperty("--pill-w", `${next}px`);
  }
}
setInterval(render, 500);
render();

// ---- wave from Spotify's own audio: 24 frequency bands from spotify-audio.ps1 ----
const bars = new Array(24).fill(0);
let levels = null, loudAt = 0; // loudAt: when the audio last moved, so a silent "playing" player shows no bars
window.bridge.onLevels(l => { levels = l; if (l.some(v => v > 8)) loudAt = Date.now(); wakeWave(); });

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
let fgApp = "";
window.bridge.onSystem(d => {
  fgApp = d.app || "";
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
function drawHello() {
  const h = new Date().getHours(), part = h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  $("dashHello").textContent = theme.name ? `${part}, ${theme.name}` : part;
  $("dashDate").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

// ---- tools: one panel at a time, in the tall view with the dock under it ----
const PANELS = [...document.querySelectorAll(".panel")].map(p => p.id);
const OPENED = { dashPanel: () => { refreshQuick(); drawHello(); }, phonePanel: startPhone, linksPanel: loadLinks, clockPanel: drawClocks, timerPanel: drawTimer, weatherPanel: drawWeather, unitsPanel: drawUnits, colorPanel: drawColors, sysPanel: drawSys, aiPanel: drawAi };
let openPanel = null;
// toggle: a second click on the button that opened it closes it (the dock only switches)
function showPanel(id, toggle = true) {
  if (toggle && id === openPanel) id = null;
  if (openPanel === "phonePanel" && id !== "phonePanel") window.bridge.phoneStop();
  openPanel = id;
  for (const p of PANELS) $(p).hidden = p !== id;
  for (const b of document.querySelectorAll("[data-panel]")) b.setAttribute("aria-pressed", b.dataset.panel === id);
  notch.classList.toggle("dash", !!id);
  if (id) OPENED[id]?.();
}

// ---- quick settings: tiles and sliders read from the system when the panel opens ----
let quickBusy = false;
function drawQuick(s) {
  if (!s) return;
  for (const t of $("qTiles").querySelectorAll("[data-q]")) {
    const v = s[t.dataset.q];
    t.disabled = v === null;
    if (v !== undefined) t.setAttribute("aria-pressed", String(!!v));
  }
  const b = $("qBright"), v = $("qVol");
  b.disabled = s.bright === null; if (s.bright !== null && document.activeElement !== b) b.value = s.bright;
  $("qBrightN").textContent = s.bright === null ? "" : Math.round(s.bright);
  v.disabled = s.vol === null; if (s.vol !== null && document.activeElement !== v) v.value = Math.round(s.vol * 100);
  $("qVolN").textContent = s.vol === null ? "" : Math.round(s.vol * 100);
}
const refreshQuick = () => window.bridge.quickGet().then(drawQuick);
const quickDo = (kind, value) => window.bridge.quickSet(kind, value).then(drawQuick);
$("qTiles").onclick = e => {
  const t = e.target.closest("[data-q]");
  if (!t || t.disabled || quickBusy) return;
  const kind = t.dataset.q;
  quickBusy = true;
  quickDo(kind, kind === "airplane" ? t.getAttribute("aria-pressed") !== "true" : undefined).finally(() => { quickBusy = false; });
};
let quickTimer;
for (const [id, kind, scale] of [["qBright", "bright", 1], ["qVol", "vol", 100]]) {
  $(id).oninput = () => { $(id + "N").textContent = $(id).value; clearTimeout(quickTimer); quickTimer = setTimeout(() => quickDo(kind, $(id).value / scale), 120); };
}
for (const b of document.querySelectorAll("[data-panel]")) b.onclick = () => showPanel(b.dataset.panel, !b.closest(".dock"));
$("dockMore").onclick = () => window.bridge.openSettings();
setInterval(() => { if (openPanel === "clockPanel") drawClocks(); else if (openPanel === "timerPanel") drawTimer(); else if (openPanel === "sysPanel") drawSys(); }, 1000);
// panels close with the notch
new MutationObserver(() => { if (!notch.classList.contains("open")) showPanel(null); })
  .observe(notch, { attributes: true, attributeFilter: ["class"] });

// ---- search: Alt+Space opens it; apps, Wi-Fi / Bluetooth, clipboard items and notes ----
let searchHits = [], searchPick = 0, searchSeq = 0;
function drawSearch() {
  const typed = $("searchInput").value.trim() !== "";
  $("searchEmpty").hidden = searchHits.length > 0;
  $("searchEmpty").textContent = typed ? "No matches" : "Type to search. Enter opens, the arrow keys move, Esc closes.";
  $("searchList").replaceChildren(...searchHits.map((h, i) => {
    const li = document.createElement("li"), b = document.createElement("button");
    b.className = i === searchPick ? "sel" : "";
    b.setAttribute("role", "option");
    b.setAttribute("aria-selected", i === searchPick);
    b.append(h.title, Object.assign(document.createElement("small"), { textContent: h.sub }));
    b.onclick = () => chooseSearch(i);
    li.append(b);
    return li;
  }));
}
async function runSearch() {
  const q = $("searchInput").value, seq = ++searchSeq;
  const hits = q.trim() ? await window.bridge.search(q) : [];
  if (seq !== searchSeq) return; // a newer keystroke is already searching
  searchHits = hits; searchPick = 0; drawSearch();
}
function chooseSearch(i) {
  const h = searchHits[i];
  if (!h) return;
  window.bridge.searchRun(h.id);
  showPanel(null); setOpen(false);
}
$("searchInput").oninput = runSearch;
$("searchInput").onkeydown = e => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (searchHits.length) searchPick = (searchPick + (e.key === "ArrowDown" ? 1 : searchHits.length - 1)) % searchHits.length;
    drawSearch();
  } else if (e.key === "Enter") { e.preventDefault(); chooseSearch(searchPick); }
};
window.bridge.onSearch(() => {
  notch.classList.remove("hidden");
  setOpen(true);
  if ($("searchPanel").hidden) showPanel("searchPanel");
  $("searchInput").value = ""; searchHits = []; drawSearch();
  $("searchInput").focus();
});
OPENED.searchPanel = () => { $("searchInput").value = ""; searchHits = []; drawSearch(); $("searchInput").focus(); };
window.bridge.onSearchDone(msg => toast({ hud: "search", app: "Search", svg: hudSvg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'), color: "#3a3a3c", title: msg, ms: 1800 }));

let clipItems = [];
function drawClips() {
  const q = $("clipSearch").value.trim().toLowerCase();
  const shown = clipItems.map((c, i) => ({ ...c, i })).filter(c => !q || c.text.toLowerCase().includes(q));
  $("clipEmpty").hidden = clipItems.length > 0;
  $("clipList").replaceChildren(...shown.map(({ text, pin, i }) => {
    const li = document.createElement("li"), b = document.createElement("button");
    const label = (pin ? "📌 " : "") + text;
    b.textContent = label;
    b.title = "Copy again · right-click to " + (pin ? "unpin" : "pin");
    b.onclick = () => { window.bridge.copyClip(i); b.textContent = "Copied"; setTimeout(() => (b.textContent = label), 900); };
    b.oncontextmenu = e => { e.preventDefault(); window.bridge.pinClip(i); };
    li.append(b);
    return li;
  }));
}
window.bridge.onClipboard(list => { clipItems = list; drawClips(); });
$("clipSearch").oninput = drawClips;
$("clipClear").onclick = () => window.bridge.clearClips();

// ---- notes: saved half a second after typing stops ----
let notesSave;
window.bridge.onNotes(t => { if (document.activeElement !== $("notesText")) $("notesText").value = t; });
$("notesText").oninput = () => { clearTimeout(notesSave); notesSave = setTimeout(() => window.bridge.saveNotes($("notesText").value), 500); };
$("notesClear").onclick = () => { $("notesText").value = ""; window.bridge.saveNotes(""); };

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
  if ($("shelfPanel").hidden) showPanel("shelfPanel");
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
window.bridge.onUpdateReady(v => toast({ update: true, app: "Islet", badge: "↑", color: "#30d158", title: `Islet ${v} is ready`, body: "Click to restart and update, or it installs when you quit.", ms: 10000 }));
window.bridge.onDownloadDone(d => toast({ id: d.id, app: "Downloads", badge: "↓", color: "#0a84ff", title: d.name, body: "Downloaded. Click to show in folder." }));
window.bridge.onScreenshot(d => toast({ id: d.id, app: "Screenshot", badge: "▣", color: "#30d158", title: d.name, body: "On the shelf. Drag it out, or click to show in folder." }));

// ---- look ----
window.bridge.onTheme(t => {
  theme = t;
  if (t.accent !== "album") document.documentElement.style.setProperty("--accent", t.accent);
  else if (track?.art) accentFrom(track.art);
  else document.documentElement.style.removeProperty("--accent");
  render();
});

// ---- phone drop ----
async function startPhone() {
  $("phoneMsg").textContent = "Starting…"; $("phoneUrl").textContent = ""; $("phoneQr").hidden = true;
  const r = await window.bridge.phoneStart();
  if (openPanel !== "phonePanel") return window.bridge.phoneStop();
  if (r.error) { $("phoneMsg").textContent = r.error; return; }
  $("phoneMsg").textContent = "Scan to connect";
  $("phoneUrl").textContent = r.url;
  $("phoneQr").src = r.qr; $("phoneQr").hidden = false;
}

// ---- links: saved sites and a web search box ----
let links = [];
const favicon = url => { try { return new URL(url).hostname.replace(/^www\./, "")[0].toUpperCase(); } catch { return "?"; } };
async function loadLinks() { links = await window.bridge.linksGet(); drawLinks(); }
function drawLinks() {
  $("linkList").replaceChildren(...links.map((l, i) => {
    const li = document.createElement("li"), b = document.createElement("button"), x = document.createElement("button");
    b.className = "lk"; b.title = l.url;
    b.append(Object.assign(document.createElement("i"), { textContent: favicon(l.url) }), Object.assign(document.createElement("span"), { textContent: l.title }));
    b.onclick = () => window.bridge.openLink(l.url);
    x.className = "lx"; x.textContent = "×"; x.title = "Remove"; x.setAttribute("aria-label", `Remove ${l.title}`);
    x.onclick = async () => { links = await window.bridge.linksSave(links.filter((_, k) => k !== i)); drawLinks(); };
    li.append(b, x);
    return li;
  }));
}
$("linkSearch").onsubmit = e => { e.preventDefault(); const q = $("linkQ").value.trim(); if (q) { window.bridge.openLink($("linkEngine").value + encodeURIComponent(q)); $("linkQ").value = ""; } };
$("linkAdd").onsubmit = async e => { e.preventDefault(); const url = $("linkUrl").value.trim(); if (!url) return; links = await window.bridge.linksSave([...links, { url }]); $("linkUrl").value = ""; drawLinks(); };

// ---- world clock: your time and the cities you add (kept in this window's storage) ----
const CITIES = { "Chennai": "Asia/Kolkata", "Dubai": "Asia/Dubai", "Singapore": "Asia/Singapore", "Tokyo": "Asia/Tokyo", "Sydney": "Australia/Sydney", "London": "Europe/London", "Berlin": "Europe/Berlin", "New York": "America/New_York", "Chicago": "America/Chicago", "San Francisco": "America/Los_Angeles", "São Paulo": "America/Sao_Paulo" };
const loadCities = () => { try { const c = JSON.parse(localStorage.getItem("clocks")); return Array.isArray(c) ? c.filter(n => n in CITIES) : ["London", "New York"]; } catch { return ["London", "New York"]; } };
let cities = loadCities();
const saveCities = () => { try { localStorage.setItem("clocks", JSON.stringify(cities)); } catch {} };
function drawClocks() {
  const now = new Date(), mine = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const sel = $("clockAdd");
  if (sel.options.length === 1) sel.append(...Object.keys(CITIES).map(c => new Option(c, c)));
  const offset = tz => { const d = new Date(now.toLocaleString("en-US", { timeZone: tz })), h = Math.round((d - new Date(now.toLocaleString("en-US"))) / 36e5 * 2) / 2; return h === 0 ? "Same time" : `${h > 0 ? "+" : ""}${h}h`; };
  const row = (name, time, sub, tz) => {
    const li = document.createElement("li");
    li.append(Object.assign(document.createElement("b"), { textContent: name }), Object.assign(document.createElement("small"), { textContent: sub }), Object.assign(document.createElement("strong"), { textContent: time }));
    if (tz) { const x = Object.assign(document.createElement("button"), { className: "lx", textContent: "×", title: `Remove ${name}` }); x.onclick = () => { cities = cities.filter(c => c !== name); saveCities(); drawClocks(); }; li.append(x); }
    return li;
  };
  $("clockList").replaceChildren(row("Here", mine, now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })),
    ...cities.map(c => row(c, now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: CITIES[c] }), offset(CITIES[c]), CITIES[c])));
}
$("clockAdd").onchange = e => { const c = e.target.value; if (c && !cities.includes(c)) { cities.push(c); saveCities(); } e.target.value = ""; drawClocks(); };

// ---- timer and focus: the same timers as the tray, plus the stopwatch ----
function drawTimer() {
  const now = Date.now(), left = Math.max(0, (timerEnd - now) / 1000);
  if (timerEnd > now) { $("timerBig").textContent = fmt(left); $("timerWhat").textContent = timerLabel; }
  else if (stopwatchStart) { $("timerBig").textContent = fmt((now - stopwatchStart) / 1000); $("timerWhat").textContent = "Stopwatch"; }
  else { $("timerBig").textContent = "0:00"; $("timerWhat").textContent = "No timer running"; }
  $("timerSub").textContent = timerEnd > now ? "Running" : "Pick a length";
  $("swBtn").textContent = stopwatchStart ? "Stop stopwatch" : "Stopwatch";
}
$("timerChips").onclick = e => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.id === "swBtn") window.bridge.stopwatchToggle();
  else window.bridge.timerStart(b.dataset.min === "pomodoro" ? "pomodoro" : Number(b.dataset.min));
};

// ---- weather: now, the next hours and the next days ----
function drawWeather() {
  const ok = wx && !wx.error;
  $("wEmpty").hidden = ok; $("wEmpty").textContent = wx?.error || "Set a city in Settings to see the weather.";
  $("wPlace").textContent = ok ? wx.place : "Weather";
  $("wMeta").textContent = ok && wx.humidity != null ? `Humidity ${wx.humidity}% · Wind ${wx.wind} km/h` : "";
  $("wIcon").textContent = ok ? wx.icon : ""; $("wTemp").textContent = ok ? `${wx.temp}°${wx.unit}` : ""; $("wLabel").textContent = ok ? wx.label : "";
  const li = (top, icon, bottom) => { const e = document.createElement("li"); e.append(Object.assign(document.createElement("small"), { textContent: top }), Object.assign(document.createElement("span"), { textContent: icon }), Object.assign(document.createElement("b"), { textContent: bottom })); return e; };
  $("wHours").replaceChildren(...(ok ? wx.hours || [] : []).map(h => li(h.time, h.icon, `${h.temp}°`)));
  $("wDays").replaceChildren(...(ok ? wx.days || [] : []).map(d => li(new Date(d.date + "T12:00").toLocaleDateString([], { weekday: "short" }), d.icon, `${d.hi}° / ${d.lo}°`)));
}
window.bridge.onWeather(() => { if (openPanel === "weatherPanel") drawWeather(); });

// ---- units ----
function drawUnits(resetUnits) {
  const k = $("uKind");
  if (!k.options.length) { k.append(...Object.entries(window.Units.KINDS).map(([id, x]) => new Option(x.label, id))); resetUnits = true; }
  const names = Object.keys(window.Units.KINDS[k.value].units);
  if (resetUnits) {
    for (const [s, i] of [[$("uFrom"), 0], [$("uTo"), 1]]) { s.replaceChildren(...names.map(n => new Option(n, n))); s.value = names[Math.min(i + (k.value === "length" ? 1 : 0), names.length - 1)]; }
  }
  const v = $("uIn").value, from = $("uFrom").value;
  $("uOut").textContent = window.Units.show(window.Units.convert(v, k.value, from, $("uTo").value));
  $("uAll").replaceChildren(...names.filter(n => n !== from).map(n => Object.assign(document.createElement("li"), { textContent: `${window.Units.show(window.Units.convert(v, k.value, from, n))} ${n}` })));
}
$("uKind").onchange = () => drawUnits(true);
for (const id of ["uIn", "uFrom", "uTo"]) $(id).oninput = () => drawUnits(false);

// ---- colour picker: Chromium's EyeDropper samples any pixel on screen ----
let colors = [];
try { colors = window.Colors.addRecent(JSON.parse(localStorage.colors || "[]")); } catch {}
function drawColors() {
  const f = window.Colors.formats(colors[0]);
  $("colorSwatch").style.setProperty("--c", f?.hex || "");
  $("colorCodes").replaceChildren(...(f ? Object.values(f) : []).map(code => {
    const b = Object.assign(document.createElement("button"), { textContent: code, title: "Copy" });
    b.onclick = () => { window.bridge.copyText(code); b.textContent = "Copied"; setTimeout(() => { b.textContent = code; }, 900); };
    return b;
  }));
  $("colorRecent").replaceChildren(...colors.slice(1).map(hex => {
    const b = Object.assign(document.createElement("button"), { title: hex, ariaLabel: hex });
    b.style.setProperty("--c", hex);
    b.onclick = () => pickedColor(hex, false);
    return b;
  }));
}
function pickedColor(hex, copy = true) {
  colors = window.Colors.addRecent(colors, hex);
  try { localStorage.colors = JSON.stringify(colors); } catch {}
  if (copy) window.bridge.copyText(colors[0]);
  drawColors();
}
$("colorPick").hidden = !("EyeDropper" in window);
if ($("colorPick").hidden) $("colorHint").textContent = "Picking from the screen isn't available in this version.";
$("colorPick").onclick = async () => {
  try { pickedColor((await new EyeDropper().open()).sRGBHex); } catch {} // Esc cancels
};

// ---- system: CPU, memory, disk, battery, Bluetooth batteries, uptime ----
let btDevices = [];
window.bridge.onDevices(list => { btDevices = list || []; });
window.bridge.onDeviceLow(d => toast({ app: "Bluetooth", badge: "!", color: "#d1453b", title: `${d.name} battery low`, body: `${d.battery}% left. Charge it soon.` }));
const gb = n => `${(n / 1024 ** 3).toFixed(1)} GB`;
async function drawSys() {
  const s = await window.bridge.sysStats();
  $("sysCpuName").textContent = `${s.cpuName} · ${s.cores} threads`;
  const used = s.mem.total - s.mem.free, up = Math.floor(s.uptime / 3600);
  const m = [["CPU", s.cpu, `${s.cpu}%`], ["Memory", Math.round(100 * used / s.mem.total), `${gb(used)} of ${gb(s.mem.total)}`]];
  if (s.disk) m.push(["Disk", Math.round(100 * (1 - s.disk.free / s.disk.total)), `${gb(s.disk.free)} free`]);
  if (battery) m.push(["Battery", Math.round(battery.level * 100), battery.charging ? "Charging" : "On battery"]);
  for (const d of btDevices) m.push([d.name, d.battery, "Bluetooth"]);
  m.push(["Uptime", null, up >= 24 ? `${Math.floor(up / 24)}d ${up % 24}h` : `${up}h ${Math.floor(s.uptime % 3600 / 60)}m`]);
  $("sysMeters").replaceChildren(...m.map(([name, pct, text]) => {
    const d = document.createElement("div");
    d.append(Object.assign(document.createElement("small"), { textContent: name, title: name }), Object.assign(document.createElement("strong"), { textContent: pct == null ? text : `${pct}%` }));
    if (pct != null) { const bar = document.createElement("i"); bar.style.setProperty("--p", `${pct}%`); d.append(bar, Object.assign(document.createElement("span"), { textContent: text })); }
    return d;
  }));
}

// ---- AI coding: every Claude Code and Codex session with its last actions ----
function drawAi() {
  $("aiEmpty").hidden = sessions.length > 0;
  $("aiList").replaceChildren(...sessions.map(s => {
    const li = document.createElement("li"), head = document.createElement("button");
    li.dataset.status = s.status;
    head.append(Object.assign(document.createElement("i"), {}), Object.assign(document.createElement("b"), { textContent: s.project }), Object.assign(document.createElement("small"), { textContent: `${s.agent === "codex" ? "Codex" : "Claude"} · ${STATUS[s.status]} · ${ago(Date.now() - s.time)}` }));
    head.title = s.cwd ? "Open project folder" : "";
    head.onclick = () => s.cwd && window.bridge.openProject(s.cwd);
    li.append(head, Object.assign(document.createElement("p"), { textContent: s.actions.map(a => a.action).join(" · ") || "No activity yet" }));
    return li;
  }));
}
window.bridge.onClaude(() => { if (openPanel === "aiPanel") drawAi(); });

// a custom pet's sprite sheet steps through its frames; the cat animates with CSS instead
setInterval(() => { if (theme.petPack && theme.pet !== false) window.Pet.tick([$("pillPet"), $("fullPet")], Date.now()); }, 125);
