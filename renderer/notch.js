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
// set from the system line further down, read by the first render() while the page loads
let fgApp = "", privUse = [];
// when things happened that the pet reacts to for a moment
let likedAt = 0, doneAt = 0, plugAt = 0, openedAt = 0, dndOn = false;

// ---- open / close; window is click-through except over the notch ----
function setOpen(o) {
  const was = notch.classList.contains("open");
  if (o && !was) { openedAt = Date.now(); prefetchQuick(); notch.classList.add("hopin"); setTimeout(() => notch.classList.remove("hopin"), 700); }
  if (!o && was) setTimeout(() => { if (pillClosed() && !notch.classList.contains("showtime")) petScene("jumpout"); }, 450); // once the pill has shrunk back
  notch.classList.toggle("open", o); notch.setAttribute("aria-expanded", o);
}
// Home's tiles and sliders come from PowerShell (~0.7 s): start reading as the notch opens, so the
// values are there by the time Home shows, and wake the mixer's helper so "Apps" opens at once
let quickAt = 0;
function prefetchQuick() {
  if (Date.now() - quickAt < 5000) return;
  quickAt = Date.now();
  refreshQuick();
  window.bridge.mixerGet();
}
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
  // Windows notifications get buttons (#225)
  $("tActs").hidden = !t.actions;
  if (t.actions) {
    $("tActs").querySelector('[data-act="reply"]').hidden = !t.actions.reply;
    $("tActs").querySelector('[data-act="dismiss"]').hidden = !t.actions.dismiss;
  }
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
  else if (current?.open) window.bridge.openLink(current.open);
  else if (current?.id) window.bridge.openNotification(current.id);
  endToast();
});
// notification buttons: Open / Reply in app open it (the reply happens in the app), Snooze brings
// the pop-up back in 10 minutes, Dismiss also clears it from the Windows notification centre
const SNOOZE_MS = 10 * 60000;
$("tActs").addEventListener("click", e => {
  const b = e.target.closest("button[data-act]"), t = current;
  if (!b || !t) return;
  e.stopPropagation();
  const act = b.dataset.act;
  if (act === "open" || act === "reply") window.bridge.openNotification(t.id);
  else if (act === "snooze") setTimeout(() => toast({ ...t, app: `${t.app.replace(/ · snoozed$/, "")} · snoozed` }), SNOOZE_MS);
  else if (act === "dismiss") window.bridge.dismissNotification(t.id);
  endToast();
});
const APP_COLORS = { WhatsApp: "#25d366", Discord: "#5865f2", Telegram: "#2aabee", Teams: "#5b5fc7", Outlook: "#0f6cbd", Slack: "#611f69", Chrome: "#4285f4", Edge: "#0c88d8", "Phone Link": "#0067c0" };
// volume / brightness HUD: the notch takes over from the Windows overlay
const HUD_SPEAKER = '<path class="fill" d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/>';
const hudSvg = body => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
// line icons for Islet's own notifications (Lucide shapes), instead of letters and emoji
const NOTE_ICONS = {
  github: hudSvg('<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>'),
  run: hudSvg('<circle cx="12" cy="12" r="10"/><path d="m10 8 6 4-6 4z"/>'),
  pr: hudSvg('<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7M6 9v12M15.5 3.5 13 6l2.5 2.5"/>'),
  deploy: hudSvg('<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>'),
  batteryLow: hudSvg('<rect x="1.5" y="6" width="17" height="12" rx="2.5"/><path d="M22 10.5v3M10 9v3.5M10 15.2h.01"/>'),
  timer: hudSvg('<path d="M10 2h4M12 14l3-3"/><circle cx="12" cy="14" r="8"/>'),
  calendar: hudSvg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  camera: hudSvg('<path d="m16 13 5.22 3.48a.5.5 0 0 0 .78-.42V7.87a.5.5 0 0 0-.75-.43L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>'),
  moon: hudSvg('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
  update: hudSvg('<circle cx="12" cy="12" r="10"/><path d="m16 12-4-4-4 4M12 16V8"/>'),
  download: hudSvg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'),
  image: hudSvg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>'),
  bluetooth: hudSvg('<path d="m7 7 10 10-5 5V2l5 5L7 17"/>'),
  headphones: hudSvg('<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>'),
  mouse: hudSvg('<rect x="5" y="2" width="14" height="20" rx="7"/><path d="M12 6v4"/>'),
  alert: hudSvg('<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>'),
  passed: hudSvg('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'),
  failed: hudSvg('<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>'),
  keyboard: hudSvg('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h1M10 8h1M14 8h1M17 8h1M8 12h1M12 12h1M16 12h1M7 16h10"/>'),
};
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
    if (now) plugAt = Date.now();
    if (theme?.powerAnim === false) return;
    if (!notch.classList.contains("hidden")) window.BlackHole.play(notch, now ? "on" : "off", battery?.level, { subtle: theme?.powerAnimStyle === "subtle" });
  }, 200);
});
navigator.getBattery?.().then(b => {
  battery = b;
  const show = () => {
    const pct = Math.round(b.level * 100);
    for (const el of [$("batt"), $("pillBatt")]) {
      // rebuilt only when it changes: a new icon restarts its glow, and Windows sends time updates often
      const html = `${battIcon(b.level, b.charging)}${pct}%`;
      if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
      el.classList.toggle("charging", b.charging);
      el.classList.toggle("low", !b.charging && b.level <= 0.2);
      el.title = b.charging ? `Charging, ${pct}%` : `Battery ${pct}%`;
    }
    $("batt").hidden = false;
    // Windows' own estimate, once it has one (Infinity until then)
    const left = s => { const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
    const est = b.charging ? b.chargingTime : b.dischargingTime, known = Number.isFinite(est) && est > 0;
    $("power").textContent = b.charging ? (b.level >= 1 ? "Fully charged" : known ? `Full in ${left(est)}` : "Charging") : known ? `${left(est)} left` : "On battery";
    $("pillBatt").hidden = !b.charging; // pill only shows it while plugged in
    notch.classList.toggle("charging", b.charging);
  };
  show();
  b.addEventListener("chargingchange", show);
  b.addEventListener("levelchange", show);
  b.addEventListener("chargingtimechange", show);
  b.addEventListener("dischargingtimechange", show);
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
    if (!b.charging && b.level <= 0.2 && !warned) { warned = true; toast({ app: "Battery", svg: NOTE_ICONS.batteryLow, color: "#d1453b", title: "Battery low", body: `${pct()} left. Plug in soon.` }); }
    if (b.level > 0.25) warned = false;
  });
});

// ---- timer + calendar ----
let timerTotal = 0; // length of the running timer, for the focus bar
window.bridge.onTimer(end => { timerTotal = end ? Math.max(0, end - Date.now()) : 0; timerEnd = end; render(); });
// a Pomodoro focus round is running: results stay in the pill instead of opening the notch
const focusing = (now = Date.now()) => timerEnd > now && /focus/i.test(timerLabel);
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
  if (!(extras.connected && extras.liked)) likedAt = Date.now(); // liking, not unliking
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
      if (theme.accent === "album") noArtAccent();
    }
  }
  render();
});

// ---- Tests and builds an agent runs ----
// "running" shows until the result arrives (or 10 minutes pass); a result shows for 8 seconds
const BUILD_SHOW_MS = 8000, BUILD_STALE_MS = 10 * 60000;
let build = null;
window.bridge.onBuild(b => {
  build = { ...b, at: Date.now() };
  if (b.state === "pass") doneAt = Date.now(); // the pet cheers
  if (b.state === "fail") lastToastAt = Date.now(); // the pet startles
  petCue({ running: "testing", pass: "pass", fail: "fail" }[b.state]);
  if (b.state !== "running" && !focusing()) peek(4000);
  renderBuild(Date.now());
});
function renderBuild(now) {
  const el = $("pillBuild");
  const age = build ? now - build.at : Infinity;
  const on = !!build && age < (build.state === "running" ? BUILD_STALE_MS : BUILD_SHOW_MS);
  // nothing from the agent: a GitHub run, PR check or deploy that's still going takes the spot
  const b = on ? build : ghLive[0] && { state: "running", label: ghLive[0].label, project: ghLive[0].repo };
  el.hidden = !b;
  if (!b) return false;
  el.dataset.state = b.state;
  setText(el.querySelector("b"), b.label);
  el.title = `${b.label}${b.project ? ` in ${b.project}` : ""}`;
  return true;
}

// ---- screen recording (#224): Windows' capture records plus OBS's own status ----
let captures = [], obsRec; // obsRec: undefined = not connected to OBS, null = connected, not recording
let obsAt = 0; // when OBS's duration was read, so the timer keeps running between reads
window.bridge.onObsRec(({ state }) => { obsRec = state ? { ...state } : null; obsAt = Date.now(); render(); });
const REC_WORD = { rec: "Recording", share: "Sharing", capture: "Capturing" };
function recNow(now) {
  const obsLive = obsRec && { ...obsRec, duration: obsRec.duration + (obsRec.paused ? 0 : now - obsAt) };
  return window.Rec.current(captures, obsRec === undefined ? undefined : obsLive, now);
}
function renderRec(now) {
  const r = recNow(now), pill = $("pillRec"), card = $("recCard");
  pill.hidden = card.hidden = !r;
  if (!r) return false;
  const time = window.Rec.clock(now - r.start), what = `${r.paused ? "Paused" : REC_WORD[r.mode]} · ${r.name}`;
  for (const el of [pill, card]) { el.dataset.mode = r.mode; el.classList.toggle("paused", r.paused); }
  setText(pill.querySelector("b"), time);
  pill.title = what;
  setText($("recTime"), time);
  setText($("recWhat"), r.name);
  card.title = what;
  card.dataset.proc = r.proc;
  $("recPause").hidden = $("recStop").hidden = !r.obs;
  const word = r.paused ? "Resume recording" : "Pause recording";
  if ($("recPause").title !== word) {
    $("recPause").title = word; $("recPause").setAttribute("aria-label", word);
    $("recPause").querySelector("svg").innerHTML = r.paused ? '<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10-6.5a1 1 0 0 0 0-1.72l-10-6.5A1 1 0 0 0 8 5.5z"/>' : '<rect x="7" y="5" width="3" height="14" rx="1"/><rect x="14" y="5" width="3" height="14" rx="1"/>';
  }
  return true;
}
$("recShow").onclick = e => { e.stopPropagation(); window.bridge.recControl("show", $("recCard").dataset.proc); };
$("recPause").onclick = e => { e.stopPropagation(); window.bridge.recControl(obsRec?.paused ? "resume" : "pause"); };
$("recStop").onclick = e => { e.stopPropagation(); window.bridge.recControl("stop"); };
window.bridge.obsRec().then(r => { if (r.connected && obsRec === undefined) obsRec = null; });

// ---- developer live activities: GitHub Actions runs, PR checks, deployments (#219) ----
let ghLive = [];
const GH_ICON = { run: NOTE_ICONS.run, pr: NOTE_ICONS.pr, deploy: NOTE_ICONS.deploy };
const GH_WORD = { pass: "passed", fail: "failed", cancel: "cancelled", skip: "skipped" };
window.bridge.onGhLive(({ live, finished }) => {
  ghLive = live;
  if (!dndOn && !focusing()) for (const a of finished.filter(x => x.state !== "skip").slice(0, 3)) {
    const ok = a.state === "pass";
    toast({ app: "GitHub", svg: a.kind === "run" && ok ? NOTE_ICONS.passed : a.kind === "run" && a.state === "fail" ? NOTE_ICONS.failed : GH_ICON[a.kind] || NOTE_ICONS.github, color: ok ? "#1f883d" : a.state === "fail" ? "#cf222e" : "#57606a",
      title: a.kind === "pr" ? a.label : `${a.label} ${GH_WORD[a.state]}`, body: `${a.detail ? a.detail + " · " : ""}${a.repo}`, open: a.url, ms: 7000 });
    if (ok) doneAt = Date.now(); else if (a.state === "fail") lastToastAt = Date.now();
    if (ok && (a.kind === "pr" || a.kind === "run")) petCue("ship"); else if (a.state === "fail") petCue("bughunt");
  }
  render();
});

// ---- what an agent is doing right now, in the closed pill ----
// working: its latest action while it's fresh; waiting: "Needs you", and the notch peeks again
// every 90 seconds (3 times at most) until someone answers
const AGENT_FRESH_MS = 60000, NUDGE_MS = 90000, NUDGES = 3;
let nudge = { key: "", at: 0, count: 0 };
function renderAgentNow(now, busy) {
  const el = $("pillAgent");
  const s = sessions.find(x => x.status === "waiting") || sessions.find(x => x.status === "working" && now - x.time < AGENT_FRESH_MS);
  if (s?.status === "waiting") {
    if (nudge.key !== s.key) nudge = { key: s.key, at: now, count: 0 };
    else if (now - nudge.at > NUDGE_MS && nudge.count < NUDGES && !perms.length) { nudge.at = now; nudge.count++; peek(4000); }
  } else nudge.key = "";
  el.hidden = !s || busy;
  if (el.hidden) return false;
  const who = s.agent === "codex" ? "Codex" : "Claude";
  el.dataset.status = s.status;
  el.textContent = s.status === "waiting" ? `${who} needs you` : s.actions[0]?.action || `${who} is working`;
  el.title = `${who} · ${s.project}`;
  return true;
}

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
      if (s.status === "done") doneAt = Date.now();
    }
    if (was && was !== "working" && s.status === "working") petCue("typing"); // an agent picked up a task
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
  const agent = p.agent === "codex" ? "Codex" : "Claude";
  $("permTool").textContent = `Allow ${agent} ${p.tool}${p.project ? ` in ${p.project}` : ""}?`;
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

// nothing playing: the wallpaper's colour, else the default grey
function noArtAccent() {
  if (theme.wallpaper) accentFrom(theme.wallpaper);
  else document.documentElement.style.removeProperty("--accent");
}
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

// sets text only when it differs, so a twice-a-second refresh doesn't relayout an idle notch
const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
function render() {
  const now = Date.now();
  // time column: clock, and under it the date, or the volume right after a scroll
  const d = new Date(), date = $("date");
  const showVol = now < volShownUntil && volume !== null;
  setText($("clock"), d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  setText($("rowTime"), $("clock").textContent); // stands in for the music bars while no song plays
  setText($("pillTime"), $("clock").textContent);
  setText(date, showVol ? `Volume ${Math.round(volume * 100)}%` : d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }));
  date.classList.toggle("vol", showVol);

  if (track) {
    setText($("title"), track.title || "Unknown");
    setText($("artist"), track.artist || "");
    const pos = shownPos(now);
    setText($("pos"), fmt(pos)); setText($("dur"), fmt(track.duration || 0));
    $("prog").style.width = (track.duration ? pos / track.duration * 100 : 0) + "%";
    // current lyric line (slightly early so it lands with the singing)
    if (lyricLines) {
      let cur = null;
      for (const l of lyricLines) { if (l.t <= pos + 0.3) cur = l; else break; }
      lyricNow = cur ? (cur.line || "♪") : "";
    }
  } else {
    setText($("title"), "Nothing playing");
    setText($("artist"), "Play music in Spotify or a browser to see it here");
    setText($("pos"), "0:00"); setText($("dur"), "0:00");
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
  // lyrics win over "up next" when the song has them; a song without any says so once the lookup is done
  const lyricShown = !!(lyricLines && track), noLyrics = lyricLines === false && !!track && !extras.next;
  setText($("upnext"), lyricShown ? lyricNow : extras.next ? `Up next: ${extras.next.title} · ${extras.next.artist}` : noLyrics ? "No synced lyrics for this song" : "");
  $("upnext").classList.toggle("lyric", lyricShown);
  $("upnext").classList.toggle("none", noLyrics);

  // right of the controls + pill chip: running timer beats the next meeting
  let side = "", chip = "", soon = false, joinable = null;
  if (timerEnd > now) {
    side = chip = `${timerLabel} ${fmt((timerEnd - now) / 1000)}`;
    soon = true;
  } else if (timerEnd && timerEnd <= now) {
    timerEnd = 0;
    // Pomodoro phases say it themselves (focusEvent), with the break tip
    if (!/^(Focus \d|Break|Long break)/.test(timerLabel)) toast({ app: "Timer", svg: NOTE_ICONS.timer, color: "#5e5ce6", title: "Time's up", body: `${timerLabel} has finished.` });
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
      if (mins <= 5 && eventPeeked !== event.start) { eventPeeked = event.start; toast({ app: "Calendar", svg: NOTE_ICONS.calendar, color: "#e8453c", title: event.title, body: mins <= 0 ? "Starting now" : `Starts in ${mins} min`, link: event.link && mins <= 10 ? event.link : undefined }); }
    }
  }
  // nothing else to say: the weather
  if (!side && wx) side = wx.error ? "" : `${wx.icon} ${wx.temp}°${wx.unit}`;
  setText($("side"), side);
  $("side").title = joinable ? `Join ${event.title}` : wx && !wx.error ? `${wx.label}, ${wx.temp}°${wx.unit} in ${wx.place}` : wx?.error || "";
  $("side").classList.toggle("soon", soon);
  $("side").classList.toggle("join", !!joinable);
  sideLink = joinable;
  setText($("pillChip"), chip);
  // focus round: a thin bar along the bottom of the pill fills up as the round goes
  notch.classList.toggle("focusing", focusing(now));
  if (focusing(now) && timerTotal) notch.style.setProperty("--focus-p", `${Math.min(100, 100 * (1 - (timerEnd - now) / timerTotal)).toFixed(2)}%`);
  const recOn = renderRec(now), building = renderBuild(now), agentNow = renderAgentNow(now, !!chip || building || recOn);
  notch.classList.toggle("wide", !!chip || building || agentNow || recOn);

  const s = shown();
  if (s) {
    setText($("cAgo"), ago(now - s.time));
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
  const mood = window.Pet.pick({ now, battery, toastAt: lastToastAt, timerEnd, timerLabel, playing: !!track?.playing, quietSince, agent, plantUntil, app: fgApp,
    likedAt, doneAt, plugAt, openedAt, meetingAt: event?.start || 0, dnd: dndOn, hour: new Date(now).getHours(),
    tempC: wx && !wx.error ? (wx.unit === "F" ? (wx.temp - 32) * 5 / 9 : wx.temp) : NaN });
  window.Pet.paint(pets, mood, theme.petPack);
  petShow(now, mood);
  // hello once the name has arrived; then a word on each new mood (not the 4-second pop-up startle), or a chat after a quiet spell
  if (!saidMood) { if (theme.name !== undefined) { saidMood = mood; petSay(mood, true); } }
  else if (mood !== saidMood && mood !== "alert" && mood !== "hello") { saidMood = mood; petSay(mood); } // a startle or a hello on opening is too brief for words
  else if (now - lastSaid > CHAT_EVERY && !notch.classList.contains("open")) petSay(mood);
}
// ---- Clawd's stage shows: the closed pill grows into a stage (CSS .showtime, 340x78) and a big sprite-sheet pet acts a scene ----
// Each scene builds keyframes with k(t, x, y, opts): t 0..1, x/y = the sprite's top-left in the stage; opts: f facing (sticks
// until changed), sq "land" / "lift" squash-stretch, e easing into the next key. Moods pick the sprite row (pet.js MOOD_ROW):
// code = running, dance = jumping, alert = waving, sick = failed. fx: [t, kind, count] particles (spark, dust, zz, drop).
const SW = 56, SH = 60, STAGE_W = 340, STAGE_H = 78;
const FLOOR = STAGE_H - SH - 2, BELOW = STAGE_H + 4, C = STAGE_W / 2 - SW / 2, OUT_L = -SW - 8, OUT_R = STAGE_W + 8;
const SQ = { land: [1.2, .8], lift: [.86, 1.14], crouch: [1.12, .86], settle: [.96, 1.04] };
const k = (t, x, y, o = {}) => ({ t, x, y, ...o });
// a jump: crouch (anticipation), stretch up, hang, squash on landing, overshoot and settle
const hop = (t, x, h, gap = .04) => [k(t - gap * 1.6, x, FLOOR, { e: "ease-out" }), k(t - gap * 1.1, x, FLOOR, { sq: "crouch", e: "cubic-bezier(.3,.6,.5,1)" }), k(t - gap * .6, x, FLOOR - h * .5, { sq: "lift", e: "cubic-bezier(.2,.6,.4,1)" }),
  k(t, x, FLOOR - h, { e: "cubic-bezier(.6,0,.8,.5)" }), k(t + gap, x, FLOOR, { sq: "land", e: "ease-out" }), k(t + gap * 1.4, x, FLOOR, { sq: "settle" }), k(t + gap * 1.8, x, FLOOR)];
const SCENES = {
  // runs in, skids to a stop, one happy hop, runs off
  run: () => ({ ms: 4600, path: [k(0, OUT_L, FLOOR, { f: 1 }), k(.34, C, FLOOR, { e: "cubic-bezier(.2,.7,.3,1)" }), k(.38, C, FLOOR, { sq: "land" }), k(.42, C, FLOOR), ...hop(.52, C, 16), k(.64, C, FLOOR, { e: "ease-in" }), k(1, OUT_R, FLOOR)],
    moods: [[0, "code"], [.36, "idle"], [.46, "dance"], [.64, "code"]], fx: [[.36, "dust", 6], [.56, "dust", 5]] }),
  // rises out of the bottom edge at the right, looks left, looks right, ducks back down
  peek: () => ({ ms: 5200, path: [k(0, STAGE_W * .66, BELOW, { f: 1, e: "cubic-bezier(.2,.9,.3,1.2)" }), k(.14, STAGE_W * .66, FLOOR + 22), k(.3, STAGE_W * .66, FLOOR + 22, { f: -1 }), k(.32, STAGE_W * .66, FLOOR + 20),
    k(.5, STAGE_W * .66, FLOOR + 20, { f: 1 }), k(.52, STAGE_W * .66, FLOOR + 22), k(.62, STAGE_W * .66, FLOOR + 6, { sq: "lift" }), k(.7, STAGE_W * .66, FLOOR + 6), k(.82, STAGE_W * .66, FLOOR + 8, { e: "ease-in" }), k(1, STAGE_W * .66, BELOW)],
    moods: [[0, "idle"], [.6, "alert"], [.8, "idle"]] }),
  // agent finished: runs in, two big jumps with sparkles, runs off
  victory: () => ({ ms: 5600, path: [k(0, OUT_L, FLOOR, { f: 1 }), k(.26, C, FLOOR, { e: "cubic-bezier(.2,.7,.3,1)" }), k(.29, C, FLOOR, { sq: "land" }), ...hop(.38, C, 22, .05), ...hop(.56, C, 22, .05), k(.7, C, FLOOR, { e: "ease-in" }), k(1, OUT_R, FLOOR)],
    moods: [[0, "code"], [.29, "happy"], [.7, "code"]], fx: [[.28, "dust", 6], [.38, "spark", 14], [.43, "dust", 5], [.56, "spark", 14], [.61, "dust", 5]] }),
  // agent needs you: pops up in the middle and waves
  wave: () => ({ ms: 5200, path: [k(0, C, BELOW, { f: 1, e: "cubic-bezier(.2,.9,.3,1.3)" }), k(.12, C, FLOOR), k(.15, C, FLOOR, { sq: "land" }), k(.18, C, FLOOR), k(.86, C, FLOOR, { sq: "lift", e: "ease-in" }), k(1, C, BELOW)],
    moods: [[0, "alert"]] }),
  // music: shuffles left and right with hops, then leaves
  dance: () => ({ ms: 7000, path: [k(0, OUT_L, FLOOR, { f: 1 }), k(.14, STAGE_W * .2, FLOOR), ...hop(.22, STAGE_W * .2, 10), k(.34, STAGE_W * .55, FLOOR, { f: 1 }), ...hop(.42, STAGE_W * .55, 10),
    k(.5, STAGE_W * .55, FLOOR, { f: -1 }), k(.58, STAGE_W * .3, FLOOR), ...hop(.66, STAGE_W * .3, 12), k(.74, STAGE_W * .3, FLOOR, { f: 1 }), k(1, OUT_R, FLOOR)],
    moods: [[0, "code"], [.14, "dance"], [.74, "code"]], fx: [[.26, "dust", 4], [.46, "dust", 4], [.7, "dust", 4]] }),
  // late night: plods to the middle, settles down, sleeps with drifting z's, sinks away
  sleep: () => ({ ms: 9000, path: [k(0, OUT_L, FLOOR, { f: 1 }), k(.3, C, FLOOR, { e: "ease-out" }), k(.36, C, FLOOR + 4, { sq: "land" }), k(.4, C, FLOOR + 6), k(.86, C, FLOOR + 6, { e: "ease-in" }), k(1, C, BELOW)],
    moods: [[0, "idle"], [.36, "sleep"]], fx: [[.42, "zz", 1], [.52, "zz", 1], [.62, "zz", 1], [.72, "zz", 1]] }),
  // low battery: drags itself across, sagging, with a sweat drop
  tired: () => ({ ms: 8000, path: [k(0, OUT_L, FLOOR + 4, { f: 1 }), k(.2, STAGE_W * .25, FLOOR + 6, { sq: "land" }), k(.3, STAGE_W * .32, FLOOR + 4), k(.45, STAGE_W * .5, FLOOR + 7, { sq: "land" }),
    k(.55, STAGE_W * .55, FLOOR + 4), k(.72, STAGE_W * .75, FLOOR + 7, { sq: "land" }), k(.8, STAGE_W * .78, FLOOR + 4), k(1, OUT_R, FLOOR + 5)],
    moods: [[0, "sick"]], fx: [[.25, "drop", 1], [.6, "drop", 1]] }),
  // plugged in: zooms across leaving a green streak
  zoom: () => ({ ms: 1500, path: [k(0, OUT_L - 60, FLOOR, { f: 1, sq: "lift" }), k(1, OUT_R + 60, FLOOR, { sq: "lift" })], moods: [[0, "code"]], cls: "trail", fx: [[.45, "dust", 8]] }),
  // focus done: carries the plant in, shows it off, carries it off
  carry: () => ({ ms: 6000, path: [k(0, OUT_L - 10, FLOOR, { f: 1 }), k(.38, C, FLOOR, { e: "cubic-bezier(.2,.7,.3,1)" }), k(.41, C, FLOOR, { sq: "land" }), ...hop(.52, C, 12), k(.66, C, FLOOR, { e: "ease-in" }), k(1, OUT_R + 10, FLOOR)],
    moods: [[0, "code"], [.41, "plant"], [.66, "code"]], cls: "carry", fx: [[.52, "spark", 10], [.56, "dust", 5]] }),
  // notch closed: springs up from below and leaps out through the top
  jumpout: () => ({ ms: 1500, path: [k(0, C, BELOW, { f: 1, e: "cubic-bezier(.2,.9,.3,1)" }), k(.3, C, FLOOR), k(.38, C, FLOOR + 4, { sq: "land" }), k(.46, C, FLOOR + 2, { sq: "lift", e: "cubic-bezier(.3,.7,.6,1)" }), k(1, C, -SH - 10, { sq: "lift" })],
    moods: [[0, "dance"]], fx: [[.44, "dust", 6]] }),
};
// ---- coding scenes: played by agent and build events (petCue), not by moods ----
const shake = (t, x, n = 6, w = 4, step = .015) => Array.from({ length: n }, (_, i) => k(t + i * step, x + (i % 2 ? w : -w), FLOOR));
Object.assign(SCENES, {
  // an agent starts working: Clawd sits down at a laptop and types, code flying up
  typing: () => ({ ms: 6500, path: [k(0, C, FLOOR, { f: 1, sq: "lift" }), k(.06, C, FLOOR, { sq: "land" }), k(.1, C, FLOOR), k(.9, C, FLOOR), k(1, C, FLOOR, { sq: "lift" })],
    moods: [[0, "work"]], cls: "laptop", fx: [.12, .22, .32, .42, .52, .62, .72, .82].map(t => [t, "code", 1]) }),
  // the agent is still busy: Clawd paces, stops to think, paces back
  thinking: () => ({ ms: 7000, path: [k(0, STAGE_W * .25, FLOOR, { f: 1 }), k(.25, STAGE_W * .6, FLOOR, { e: "ease-in-out" }), k(.3, STAGE_W * .6, FLOOR), k(.55, STAGE_W * .6, FLOOR, { f: -1 }),
    k(.8, STAGE_W * .25, FLOOR, { e: "ease-in-out" }), k(.85, STAGE_W * .25, FLOOR, { f: 1 }), k(1, STAGE_W * .25, FLOOR)],
    moods: [[0, "code"], [.27, "ask"], [.55, "code"], [.82, "idle"]], fx: [[.32, "dots", 1], [.42, "dots", 1], [.86, "bulb", 1]] }),
  // tests running: running in place, faster and faster, a progress trail of dots
  testing: () => ({ ms: 5000, path: [k(0, C, FLOOR, { f: 1 }), ...Array.from({ length: 10 }, (_, i) => k(.08 + i * .09, C + (i % 2 ? 6 : -6), FLOOR - (i % 2 ? 4 : 0), { e: "ease-in-out" })), k(1, C, FLOOR)],
    moods: [[0, "code"]], fx: [.1, .25, .4, .55, .7, .85].map(t => [t, "dust", 3]) }),
  // tests passed: a big green tick, a jump, green confetti
  pass: () => ({ ms: 4800, path: [k(0, C, FLOOR, { f: 1 }), k(.15, C, FLOOR + 4, { sq: "land" }), ...hop(.3, C, 24, .06), ...hop(.55, C, 14, .05), k(.75, C, FLOOR), k(1, C, FLOOR)],
    moods: [[0, "idle"], [.18, "happy"]], fx: [[.2, "check", 1], [.3, "confetti", 16], [.55, "confetti", 10], [.36, "dust", 5]] }),
  // tests failed: a red cross, Clawd flinches, shakes and slumps, a puff of smoke
  fail: () => ({ ms: 5200, path: [k(0, C, FLOOR, { f: 1 }), k(.12, C, FLOOR, { sq: "lift" }), k(.16, C - 10, FLOOR, { sq: "land" }), ...shake(.2, C - 10, 8, 4),
    k(.36, C - 10, FLOOR), k(.5, C - 10, FLOOR + 6, { sq: "land" }), k(.9, C - 10, FLOOR + 6), k(1, C - 10, FLOOR)],
    moods: [[0, "alert"], [.16, "sick"]], fx: [[.14, "cross", 1], [.3, "smoke", 5], [.55, "smoke", 3]] }),
  // a CI run failed on GitHub: a bug crawls across, Clawd chases it and stomps it
  bughunt: () => ({ ms: 6500, path: [k(0, STAGE_W * .02, FLOOR, { f: 1 }), k(.15, STAGE_W * .1, FLOOR), k(.6, STAGE_W * .66, FLOOR, { e: "ease-in" }), ...hop(.68, STAGE_W * .72, 18, .05), k(.78, STAGE_W * .72, FLOOR + 4, { sq: "land" }),
    k(.85, STAGE_W * .72, FLOOR), ...hop(.92, STAGE_W * .72, 10, .03)],
    moods: [[0, "alert"], [.15, "code"], [.74, "happy"]], fx: [[0, "bug", 1], [.73, "smoke", 6], [.75, "spark", 10]] }),
  // a pull request merged or a CI run passed: a rocket launches, Clawd waves it off
  ship: () => ({ ms: 5500, path: [k(0, OUT_L, FLOOR, { f: 1 }), k(.25, STAGE_W * .3, FLOOR, { e: "cubic-bezier(.2,.7,.3,1)" }), k(.28, STAGE_W * .3, FLOOR, { sq: "land" }), k(.32, STAGE_W * .3, FLOOR),
    ...hop(.75, STAGE_W * .3, 16), k(.85, STAGE_W * .3, FLOOR), k(1, STAGE_W * .3, FLOOR)],
    moods: [[0, "code"], [.28, "alert"], [.7, "happy"]], fx: [[.3, "rocket", 1], [.32, "smoke", 6], [.7, "confetti", 12]] }),
});
// coding events wait for the pill to close (a peek or a toast often shows first), up to 15 s, then play
let cueTimer = 0;
function petCue(name, tries = 30) {
  clearTimeout(cueTimer);
  if (pillClosed() && !notch.classList.contains("showtime")) { if (petScene(name)) showAt = Date.now(); return; }
  if (tries > 0) cueTimer = setTimeout(() => petCue(name, tries - 1), 500);
}
// which scene a new mood plays; any other lively mood gets the plain run
const MOOD_SCENE = { happy: "victory", ask: "wave", dance: "dance", sleep: "sleep", sleepy: "sleep", sick: "tired", charge: "zoom", plant: "carry",
  alert: "run", hello: "run", love: "victory" };
const SHOW_EVERY = 90000, ASK_EVERY = 20000, THINK_EVERY = 45000;
let showAt = Date.now() - SHOW_EVERY + 6000, showMood = "", showTimers = [], showAnim = null, shadowAnim = null;
const pillClosed = () => !["open", "toast", "hidden"].some(c => notch.classList.contains(c));
function petScene(name) {
  const make = SCENES[name], stage = $("stagePet"), fx = $("stageFx");
  if (!make || !theme.petPack || theme.pet === false || matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  showTimers.forEach(clearTimeout); showTimers = []; showAnim?.cancel(); shadowAnim?.cancel(); fx.textContent = "";
  const s = make(), shadow = $("stageShadow");
  stage.dataset.mood = ""; // className below drops the mood class, so paint() must set it again
  stage.className = "pet stage custom" + (s.cls ? " " + s.cls : ""); // keep "custom": paint() adds it only when the pet kind changes
  window.Pet.paint([stage], s.moods[0][1], theme.petPack);
  stage.style.opacity = "0";
  notch.classList.add("showtime"); // the notch keeps its size: only the pill's content fades out
  const GROW = 200;
  // scenes are authored on a 340x78 stage with a 56x60 sprite; map them onto the real pill (its width, 30px tall, 26x28 sprite)
  // Clawd never leaves the notch: positions are clamped inside it, and where a scene went off an edge it fades / shrinks instead
  const PW = 22, PH = 24, W = notch.clientWidth, H = notch.clientHeight, PAD = 8;
  const sx0 = (W - PW - 2 * PAD) / (STAGE_W - SW), u = 9 / 22; // a 22px jump in the scene = 9px here, which still fits under the top
  const ground = H - PH - 1;
  const outside = p => p.x < 0 || p.x > STAGE_W - SW || p.y > FLOOR + 30 || p.y < -SH / 2;
  const mx = x => PAD + Math.min(W - PW - 2 * PAD, Math.max(0, x * sx0)), my = y => Math.max(0, Math.min(ground, ground + (y - FLOOR) * u));
  // walking: on every stretch where Clawd moves along the floor, add a step bob (up on each stride) every ~140 ms
  const path = [];
  s.path.forEach((p, i) => {
    path.push(p);
    const n = s.path[i + 1];
    if (!n || p.y !== n.y || Math.abs(n.x - p.x) < 20) return;
    const steps = Math.floor((n.t - p.t) * s.ms / 140);
    for (let j = 1; j < steps; j++) { const f = j / steps; path.push({ t: p.t + (n.t - p.t) * f, x: p.x + (n.x - p.x) * f, y: p.y - (j % 2 ? 5 : 0), sq: j % 2 ? "settle" : "", bob: true }); }
  });
  // lean: tilt toward where Clawd is heading, harder the faster it goes; lean back when it brakes
  const speed = i => { const a = path[i], b = path[i + 1]; return b && b.t > a.t ? (b.x - a.x) / ((b.t - a.t) * s.ms) : 0; }; // virtual px per ms
  let face = 1;
  const keys = path.map((p, i) => { if (p.f) face = p.f; const [sx, sy] = SQ[p.sq] || [1, 1], out = outside(p);
    const v = speed(i), braking = Math.abs(v) < Math.abs(speed(i - 1) || 0) * .4;
    const lean = Math.max(-10, Math.min(10, (braking ? -(speed(i - 1) || 0) * 15 : v * 30)));
    return { offset: Math.min(1, Math.max(0, p.t)), easing: p.bob ? "ease-in-out" : p.e || "linear", opacity: out ? 0 : 1,
      transform: `translate(${mx(p.x)}px, ${my(p.y)}px) rotate(${lean}deg) scale(${face * sx * (out ? .6 : 1)}, ${sy * (out ? .6 : 1)})` }; });
  keys.sort((a, b) => a.offset - b.offset);
  // the shadow stays on the floor under Clawd, smaller and fainter the higher it is; gone when Clawd is below the edge
  const shadowKeys = s.path.map(p => { const lift = Math.max(0, FLOOR - p.y), gone = p.y > FLOOR + 12 || p.y < -SH / 2;
    return { offset: Math.min(1, Math.max(0, p.t)), easing: p.e || "linear", transform: `translateX(${mx(p.x) + PW / 2 - 9}px) scaleX(${Math.max(.4, 1 - lift / 30)})`, opacity: gone || outside(p) ? 0 : Math.max(.15, .55 - lift / 50) }; });
  shadowKeys.sort((a, b) => a.offset - b.offset);
  showTimers.push(setTimeout(() => {
    stage.style.opacity = "";
    showAnim = stage.animate(keys, { duration: s.ms, fill: "forwards" });
    shadowAnim = shadow.animate(shadowKeys, { duration: s.ms, fill: "forwards" });
    for (const [t, mood] of s.moods.slice(1)) showTimers.push(setTimeout(() => window.Pet.paint([stage], mood, theme.petPack), s.ms * t));
    for (const [t, kind, n] of s.fx || []) showTimers.push(setTimeout(() => burst(kind, n), s.ms * t));
    showTimers.push(setTimeout(() => { notch.classList.remove("showtime"); showAnim?.cancel(); shadowAnim?.cancel(); stage.className = "pet stage custom"; fx.textContent = ""; }, s.ms));
  }, GROW));
  return true;
}
// particles at Clawd's current spot
function burst(kind, n) {
  const stage = $("stagePet"), fx = $("stageFx"), r = stage.getBoundingClientRect(), b = notch.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const p = document.createElement("i");
    p.className = kind;
    p.textContent = { zz: "z", drop: "💧", code: ["{ }", "</>", ";", "=>", "()", "#", "[ ]", "fn"][Math.floor(Math.random() * 8)], dots: "…", bulb: "💡", check: "✓", cross: "✕", rocket: "🚀", bug: "🐛" }[kind] || "";
    if (kind === "confetti") p.style.background = ["#63d47a", "#ffd60a", "#7cc4ff", "#ff6b8b", "#c9b8ff"][i % 5];
    if (kind === "bug") { // crawls ahead of Clawd and gets caught near the right
      const W = notch.clientWidth;
      p.style.left = "0px"; p.style.top = `${notch.clientHeight - 13}px`;
      p.animate([{ transform: `translateX(${W * .12}px)` }, { transform: `translateX(${W * .45}px)`, offset: .4 }, { transform: `translateX(${W * .7}px)`, offset: .7 }, { transform: `translateX(${W * .7}px) scale(1.3, .2)`, opacity: 0 }],
        { duration: 6500 * .78, fill: "forwards" });
      fx.append(p); setTimeout(() => p.remove(), 6000); continue;
    }
    const cx = r.left - b.left + r.width / 2;
    p.style.left = `${["zz", "drop", "dots", "bulb", "check", "cross"].includes(kind) ? cx + 7 : kind === "code" ? cx - 6 + Math.random() * 12 : cx - 2}px`;
    p.style.top = `${kind === "dust" || kind === "smoke" ? r.bottom - b.top - 5 : kind === "spark" || kind === "confetti" ? r.top - b.top + r.height * .4 : kind === "rocket" ? notch.clientHeight - 14 : Math.max(1, r.top - b.top)}px`;
    if (kind === "rocket") p.style.left = `${notch.clientWidth * .62}px`;
    if (kind === "dust") p.style.setProperty("--dx", `${(i % 2 ? 1 : -1) * (4 + Math.random() * 8)}px`);
    const a = Math.random() * Math.PI * 2, d = 10 + Math.random() * 14;
    if (kind !== "dust") p.style.setProperty("--dx", `${Math.cos(a) * d}px`); p.style.setProperty("--dy", `${Math.sin(a) * d * .6}px`);
    fx.append(p);
    setTimeout(() => p.remove(), 2000);
  }
}
function petShow(now, mood) {
  if (notch.classList.contains("showtime")) return; // a mood change mid-scene waits for the next tick
  const changed = mood !== showMood; showMood = mood;
  if (!pillClosed()) return;
  let scene = changed ? MOOD_SCENE[mood] : "";
  if (!scene && mood === "ask" && now - showAt > ASK_EVERY) scene = "wave"; // keeps waving until you look
  if (!scene && mood === "code" && now - showAt > THINK_EVERY) scene = "thinking"; // an agent is busy: Clawd thinks along
  if (!scene && now - showAt > SHOW_EVERY) scene = Math.random() < .5 ? "run" : "peek";
  if (scene && petScene(scene)) showAt = now;
}
window.bridge.onPetScene?.(name => { if (pillClosed() && petScene(name)) showAt = Date.now(); });
// closed pill: as wide as what it shows, no empty black on either side
let fittedPillWidth = 0;
function fitPill() {
  const pill = document.querySelector(".pill"), ps = getComputedStyle(pill);
  const items = [...pill.children].filter(el => el.offsetWidth && getComputedStyle(el).visibility !== "hidden");
  // only the pet has fixed margins; the chips use margin-left: auto, which would feed the pill's own extra width back in and grow it forever
  const margins = el => { if (!el.classList.contains("pet")) return 0; const c = getComputedStyle(el); return parseFloat(c.marginLeft) + parseFloat(c.marginRight); };
  const w = items.reduce((n, el) => n + el.offsetWidth + margins(el), 0) + 8 * (items.length - 1) + parseFloat(ps.paddingLeft) + parseFloat(ps.paddingRight); // items, gaps, side padding
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
window.bridge.onSystem(d => {
  fgApp = d.app || "";
  captures = Array.isArray(d.capture) ? d.capture : [];
  const kinds = [["mic", "Microphone", d.mic], ["cam", "Camera", d.cam], ["screen", "Screen capture", d.screen]];
  privUse = kinds.filter(([, , apps]) => apps?.length);
  for (const box of [$("pillPriv"), $("priv")]) {
    box.replaceChildren(...kinds.filter(([, , apps]) => apps?.length).map(([cls, label, apps]) => {
      const i = document.createElement("i");
      i.className = cls;
      i.title = `${label} in use: ${apps.join(", ")}`;
      return i;
    }));
  }
});

// clicking the dots says which apps use the mic, camera or screen
$("priv").onclick = () => {
  if (!privUse.length) return;
  toast({ app: "Privacy", svg: privUse.some(([c]) => c === "cam") ? NOTE_ICONS.camera : HUD_ICONS.mic, color: privUse.some(([c]) => c === "cam") ? "#30d158" : "#ff9f0a", title: privUse.map(([, label]) => label).join(", ") + " in use", body: privUse.map(([, label, apps]) => `${label}: ${apps.join(", ")}`).join(" · ") });
};
window.bridge.onDndSummary(m => toast({ app: "Do Not Disturb", svg: NOTE_ICONS.moon, color: "#5e5ce6", title: "While you were away", body: m.text }));

// ---- album view ----
$("artBtn").addEventListener("click", () => { if (track?.art) { $("albumv").hidden = false; renderAlbum(); } });
$("albumv").addEventListener("click", () => { $("albumv").hidden = true; });
// closes with the notch so it doesn't reappear on next hover
new MutationObserver(() => { if (!notch.classList.contains("open")) $("albumv").hidden = true; })
  .observe(notch, { attributes: true, attributeFilter: ["class"] });
function renderAlbum() {
  if ($("albumv").hidden || !track) return;
  $("albumv").querySelectorAll("img").forEach(i => { if (i.src !== track.art) i.src = track.art; });
  setText($("aTitle"), track.title || "");
  setText($("aArtist"), track.artist || "");
  setText($("aLyric"), lyricLines ? lyricNow : lyricLines === false ? "No synced lyrics" : "");
  // Spotify's queue, when the account is connected
  const q = extras.queue || [];
  $("aQueue").hidden = !q.length;
  $("aQueue").replaceChildren(...(q.length ? [Object.assign(document.createElement("small"), { textContent: "Up next" })] : []),
    ...q.map(s => Object.assign(document.createElement("li"), { textContent: `${s.title} · ${s.artist}` })));
}
setInterval(renderAlbum, 500);

// ---- Do Not Disturb ----
window.bridge.onDnd(on => {
  dndOn = !!on;
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
const OPENED = { dashPanel: () => { prefetchQuick(); drawHello(); closeMixer(); }, phonePanel: startPhone, linksPanel: loadLinks, clockPanel: drawClocks, timerPanel: () => { drawTimer(); drawFocusStats(); }, colorPanel: drawColors, sysPanel: drawSys, aiPanel: () => { drawAi(); drawLimits(true); }, devPanel: drawDev };
let openPanel = null;
// toggle: a second click on the button that opened it closes it (the dock only switches)
function showPanel(id, toggle = true) {
  if (toggle && id === openPanel) id = null;
  if (openPanel === "phonePanel" && id !== "phonePanel") window.bridge.phoneStop();
  const was = openPanel;
  openPanel = id;
  for (const p of PANELS) { $(p).hidden = p !== id; $(p).classList.remove("leaving"); }
  // tool to tool: the old panel stays a moment and fades out under the new one
  if (was && id && was !== id && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const old = $(was);
    old.hidden = false;
    old.classList.add("leaving");
    setTimeout(() => { if (openPanel !== was) { old.classList.remove("leaving"); old.hidden = true; } }, 150);
  }
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
for (const [id, kind, scale] of [["qBright", "bright", 1], ["qVol", "vol", 100]]) {
  let quickTimer;
  $(id).oninput = () => { $(id + "N").textContent = $(id).value; clearTimeout(quickTimer); quickTimer = setTimeout(() => quickDo(kind, $(id).value / scale), 120); };
}
// ---- per-app volume (#223): one row per app with sound, under the volume slider ----
const SPEAKER = '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/>';
const SPEAKER_ON = SPEAKER + '<path d="M16 9a5 5 0 0 1 0 6"/>', SPEAKER_OFF = SPEAKER + '<path d="m22 9-6 6"/><path d="m16 9 6 6"/>';
let mixerSeq = 0;
function drawMixer(list) {
  const ul = $("qMixer");
  if (!list.length) { ul.replaceChildren(Object.assign(document.createElement("li"), { className: "empty", textContent: "No app is using the speakers" })); return; }
  // rows being dragged keep their slider; everything else is rebuilt
  const held = document.activeElement?.closest?.(".qmixer li")?.dataset.app;
  ul.replaceChildren(...list.map(r => {
    if (r.app === held) return ul.querySelector(`li[data-app="${CSS.escape(held)}"]`);
    const li = document.createElement("li"), mute = document.createElement("button"), range = document.createElement("input"), out = document.createElement("output");
    li.dataset.app = r.app;
    li.classList.toggle("active", r.active);
    li.classList.toggle("muted", r.mute);
    mute.type = "button";
    mute.title = r.mute ? `Unmute ${r.name}` : `Mute ${r.name}`;
    mute.setAttribute("aria-pressed", r.mute);
    mute.innerHTML = `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${r.mute ? SPEAKER_OFF : SPEAKER_ON}</svg>`;
    mute.onclick = () => mixerDo(r.app, "mute", !r.mute);
    Object.assign(range, { type: "range", min: 0, max: 100, value: Math.round(r.vol * 100) });
    range.setAttribute("aria-label", `${r.name} volume`);
    out.textContent = range.value;
    let t;
    range.oninput = () => { out.textContent = range.value; clearTimeout(t); t = setTimeout(() => mixerDo(r.app, "vol", range.value / 100), 120); };
    li.append(Object.assign(document.createElement("b"), { textContent: r.name, title: r.active ? `${r.name} · playing` : r.name }), mute, range, out);
    return li;
  }));
}
function mixerDo(app, kind, value) {
  const seq = ++mixerSeq;
  return (kind ? window.bridge.mixerSet(app, kind, value) : window.bridge.mixerGet()).then(list => { if (seq === mixerSeq) drawMixer(list); });
}
function closeMixer() { $("qMixer").hidden = true; $("qTiles").hidden = false; $("qMixBtn").setAttribute("aria-expanded", false); }
$("qMixBtn").onclick = e => {
  e.preventDefault(); // inside the volume label: don't focus the slider
  const open = $("qMixer").hidden;
  $("qMixer").hidden = !open;
  $("qMixBtn").setAttribute("aria-expanded", open);
  $("qTiles").hidden = open; // the apps take the tiles' place, the panel has no room for both
  if (open) mixerDo();
};
// while it's open, apps that start or stop playing show up within a few seconds
setInterval(() => { if (openPanel === "dashPanel" && !$("qMixer").hidden && !document.hidden) mixerDo(); }, 4000);
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
  // one of Islet's own tools: switch to it right here, the notch stays open
  if (h.id.startsWith("tool:") && PANELS.includes(h.id.slice(5))) return showPanel(h.id.slice(5), false);
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
    const more = document.createElement("button");
    more.className = "lx clipMore"; more.title = "Actions: clean, convert, format"; more.setAttribute("aria-label", "Actions");
    more.innerHTML = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4M19 14v4M10 2v2M7 8H3M21 16h-4M11 3H9"/></svg>';
    more.onclick = () => toggleClipActs(li, i);
    li.className = "clipRow";
    li.append(b, more);
    return li;
  }));
}
// Clipboard Actions: the wand shows chips for the transforms that fit this item; a chip copies the result
async function toggleClipActs(li, i) {
  const open = li.querySelector(".clipActs");
  document.querySelectorAll("#clipList .clipActs").forEach(x => x.remove());
  if (open) return;
  const acts = await window.bridge.clipActions(i), box = document.createElement("div");
  box.className = "clipActs";
  if (!acts.length) box.append(Object.assign(document.createElement("span"), { textContent: "Nothing to change here" }));
  box.append(...acts.map(a => {
    const c = document.createElement("button");
    c.textContent = a.label;
    c.onclick = async () => {
      const ok = await window.bridge.runClipAction(i, a.id);
      toast({ hud: "clip", app: "Clipboard", svg: hudSvg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'), color: "#3a3a3c", title: ok ? a.label + ": copied" : "Couldn't " + a.label.toLowerCase(), ms: 1600 });
    };
    return c;
  }));
  li.append(box);
}
window.bridge.onClipboard(list => { clipItems = list; drawClips(); });
$("clipSearch").oninput = drawClips;
$("clipClear").onclick = () => window.bridge.clearClips();

// ---- notes: saved half a second after typing stops ----
let notesSave;
window.bridge.onNotes(t => { if (document.activeElement !== $("notesText")) $("notesText").value = t; });
// a failed save says so and keeps the text in the box; the next edit (or a click on the message) tries again
const saveError = (id, r) => { $(id).hidden = r.ok; if (!r.ok) $(id).textContent = `Not saved (${r.error})`; return r.ok; };
async function saveNotesNow() {
  clearTimeout(notesSave);
  saveError("notesErr", await window.bridge.saveNotes($("notesText").value));
}
$("notesText").oninput = () => { clearTimeout(notesSave); notesSave = setTimeout(saveNotesNow, 500); };
$("notesErr").onclick = saveNotesNow;
$("notesClear").onclick = () => { $("notesText").value = ""; saveNotesNow(); };

window.bridge.onShelf(files => {
  $("shelfEmpty").hidden = files.length > 0;
  $("shelfList").replaceChildren(...files.map(f => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.className = "file";
    b.draggable = true;
    b.title = `${f.name}\nDrag out to use it, double-click to show in folder, right-click to resize, convert or compress`;
    if (f.icon) b.append(Object.assign(document.createElement("img"), { src: f.icon, alt: "" }));
    b.append(Object.assign(document.createElement("span"), { textContent: f.name }));
    b.ondragstart = e => { e.preventDefault(); window.bridge.shelfDrag(f.path); };
    b.ondblclick = () => window.bridge.shelfOpen(f.path);
    b.oncontextmenu = e => { e.preventDefault(); window.bridge.shelfMenu(f.path); };
    const x = Object.assign(document.createElement("button"), { className: "x", textContent: "✕", title: `Remove ${f.name} from shelf` });
    x.onclick = () => window.bridge.shelfRemove(f.path);
    li.append(b, x);
    return li;
  }));
});
window.bridge.onShelfAction(d => toast(d.ok
  ? { id: "shelf-" + d.name, app: "Shelf", svg: NOTE_ICONS.image, color: "#30d158", title: d.name, body: `${d.label} done. It's on the shelf, next to the original.` }
  : { id: "shelf-err", app: "Shelf", svg: NOTE_ICONS.alert, color: "#ff453a", title: d.label, body: `Couldn't do that: ${d.error}` }));
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
window.bridge.onUpdateReady(v => toast({ update: true, app: "Islet", svg: NOTE_ICONS.update, color: "#30d158", title: `Islet ${v} is ready`, body: "Click to restart and update, or it installs when you quit.", ms: 10000 }));
window.bridge.onDownloadDone(d => toast({ id: d.id, app: "Downloads", svg: NOTE_ICONS.download, color: "#0a84ff", title: d.name, body: "Downloaded. Click to show in folder." }));
window.bridge.onScreenshot(d => toast({ id: d.id, app: "Screenshot", svg: NOTE_ICONS.image, color: "#30d158", title: d.name, body: "On the shelf. Drag it out, or click to show in folder." }));

// ---- look ----
window.bridge.onTheme(t => {
  theme = t;
  // Theme Studio (#222): colour tokens, shape and motion
  if (t.studio) {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(t.studio.tokens)) root.style.setProperty(`--${k}`, v);
    notch.dataset.shape = t.studio.pillShape;
    root.dataset.motion = t.studio.motion;
  }
  if (t.accent !== "album") document.documentElement.style.setProperty("--accent", t.accent);
  else if (track?.art) accentFrom(track.art);
  else noArtAccent();
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
    x.onclick = () => saveLinksNow(links.filter((_, k) => k !== i));
    li.append(b, x);
    return li;
  }));
}
$("linkSearch").onsubmit = e => { e.preventDefault(); const q = $("linkQ").value.trim(); if (q) { window.bridge.openLink($("linkEngine").value + encodeURIComponent(q)); $("linkQ").value = ""; } };
// the list and the input change only once the save is on disk
async function saveLinksNow(next) {
  const r = await window.bridge.linksSave(next);
  if (!saveError("linksErr", r)) return false;
  links = r.value; drawLinks(); return true;
}
$("linkAdd").onsubmit = async e => { e.preventDefault(); const url = $("linkUrl").value.trim(); if (!url) return; if (await saveLinksNow([...links, { url }])) $("linkUrl").value = ""; };

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

// Focus Mode 2.0 (#226): break reminders, the session summary and today's focus time
function drawFocusStats(line) {
  if (line) $("focusStats").textContent = line;
  else window.bridge.focusStats().then(l => { $("focusStats").textContent = l; });
}
window.bridge.onFocusEvent(e => {
  drawFocusStats(e.stats);
  const svg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>';
  if (e.kind === "summary") toast({ id: "focus", app: "Focus", svg, color: "#5e5ce6", title: "Focus session done", body: `${e.body} ${e.stats}.` });
  else toast({ id: "focus", app: "Focus", svg, color: e.kind === "break" ? "#30d158" : "#5e5ce6", title: e.title, body: e.body });
  if (e.kind === "break") peek(5000);
});

// Dev panel tabs: one section at a time; the last one opens next time
function devTab(name) {
  for (const b of $("devTabs").children) b.setAttribute("aria-selected", b.dataset.tab === name);
  for (const sct of document.querySelectorAll("#devPanel .dsec")) sct.hidden = sct.dataset.tab !== name;
  try { localStorage.setItem("devTab", name); } catch {}
}
$("devTabs").onclick = e => { const b = e.target.closest("button"); if (b) devTab(b.dataset.tab); };
let savedDevTab = "git";
try { savedDevTab = localStorage.getItem("devTab") || "git"; } catch {}
devTab(savedDevTab);

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
window.bridge.onDeviceLow(d => toast({ app: "Bluetooth", svg: NOTE_ICONS.batteryLow, color: "#d1453b", title: `${d.name} battery low`, body: `${d.battery}% left. Charge it soon.` }));
// Bluetooth device island: a pop-up when a device connects or disconnects
const btIcon = n => /bud|pod|ear|head|phone|airdopes|buzz|sound|audio|speaker|jbl|sony|wh-|wf-/i.test(n) ? NOTE_ICONS.headphones : /mouse/i.test(n) ? NOTE_ICONS.mouse : /keyboard|keys/i.test(n) ? NOTE_ICONS.keyboard : NOTE_ICONS.bluetooth;
const btBody = b => b == null ? "Connected" : `Connected · ${b}% battery`;
window.bridge.onBtConnect(e => toast(e.type === "connected"
  ? { id: "bt-" + e.name, app: "Bluetooth", svg: btIcon(e.name), color: "#0a84ff", title: e.name, body: btBody(e.battery), ms: 4000 }
  : { id: "bt-" + e.name, app: "Bluetooth", svg: btIcon(e.name), color: "#636366", title: e.name, body: "Disconnected", ms: 3000 }));
window.bridge.onBtBattery(d => toast({ id: "bt-" + d.name, app: "Bluetooth", svg: btIcon(d.name), color: "#0a84ff", title: d.name, body: btBody(d.battery), ms: 4000 }));
window.bridge.onAgentUpdate(u => toast({ app: u.name, svg: NOTE_ICONS.update, color: "#6b5bd6", title: `${u.name} ${u.version} is out`, body: `Update with: ${u.update}`, ms: 7000 }));
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

// ---- Dev: git for the project an agent works in, local servers, snippets, clipboard decoding ----
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
function drawDev() { drawGit(); drawPorts(); drawSnippets(); drawDecode(); }
async function drawGit() {
  // the project of the session shown in the pill, else the newest one with a folder
  const s = [shown(), ...sessions].find(x => x?.cwd);
  const g = s ? await window.bridge.devGit(s.cwd) : null;
  $("gitRepo").textContent = g ? g.repo : "";
  if (!g) {
    $("gitLine").textContent = s ? "Not a git repository" : "Start Claude Code or Codex in a project to see its git status";
    $("gitFiles").replaceChildren(); $("tabGitN").textContent = "";
    return;
  }
  const sync = [g.ahead ? `↑${g.ahead}` : "", g.behind ? `↓${g.behind}` : ""].filter(Boolean).join(" ") || "in sync";
  $("gitLine").replaceChildren(el("b", { textContent: g.branch }), el("span", { textContent: ` · ${sync} · ${g.files.length ? `${g.files.length} changed` : "clean"}` }));
  $("tabGitN").textContent = g.files.length || "";
  $("gitFiles").replaceChildren(...g.files.slice(0, 30).map(f => el("li", { title: f.file }, el("i", { textContent: f.code, className: `c${f.code === "?" ? "N" : f.code}` }), el("span", { textContent: f.file }))));
}
async function drawPorts() {
  const list = await window.bridge.devPorts();
  $("tabPortsN").textContent = list.length || "";
  $("portsList").replaceChildren(...(list.length ? list.map(p => {
    const open = el("button", { className: "link", textContent: "Open", title: `Open localhost:${p.port}`, onclick: () => window.bridge.devOpenPort(p.port) });
    const kill = el("button", { className: "link stop", textContent: "Stop", title: `End ${p.name || "process"} (${p.pid})` });
    kill.onclick = async () => { kill.disabled = true; await window.bridge.devKill(p.pid); drawPorts(); };
    return el("li", {}, el("b", { textContent: `:${p.port}` }), el("span", { textContent: p.name.replace(/\.exe$/i, "") || `pid ${p.pid}` }), open, kill);
  }) : [el("li", { className: "none", textContent: "No dev servers running" })]));
}
$("portsRefresh").onclick = drawPorts;
// a failed save (#256) keeps the edit on screen as snipPending and says "Not saved"; clicking the
// message tries the same list again, and only a successful save goes back to the stored list
let snippets = [], snipPending = null;
async function drawSnippets() {
  if (!snipPending) snippets = await window.bridge.snippetsGet();
  $("snipList").replaceChildren(...snippets.map((sn, i) => {
    const copy = el("button", { className: "snip", title: sn.text }, el("b", { textContent: sn.name }), el("code", { textContent: sn.text }));
    copy.onclick = () => { window.bridge.copySnippet(sn.text); copy.classList.add("copied"); setTimeout(() => copy.classList.remove("copied"), 900); };
    const del = el("button", { className: "link", textContent: "×", title: "Remove" });
    del.onclick = () => saveSnips(snippets.filter((_, j) => j !== i));
    return el("li", {}, copy, del);
  }));
}
function snipSaved(r, list) {
  saveError("snipErr", r);
  snipPending = r.ok ? null : list;
  if (!r.ok) snippets = list;
  drawSnippets();
}
async function saveSnips(list) { snipSaved(await window.bridge.snippetsSave(list), list); }
$("snipAdd").onclick = async () => { const r = await window.bridge.snippetFromClipboard(); snipSaved(r, r.value); };
$("snipErr").onclick = () => { if (snipPending) saveSnips(snipPending); };
async function drawDecode() {
  const d = await window.bridge.devDecode();
  $("decTitle").textContent = d ? d.title : "";
  $("decText").textContent = d ? d.text : "Copy JSON, a JWT, Base64, a timestamp or a URL-encoded string to decode it here.";
  $("decText").classList.toggle("none", !d);
}
// dock: a tool's name appears above it after a short hover
for (const b of document.querySelectorAll(".dock button")) {
  let t = 0;
  b.addEventListener("mouseenter", () => { clearTimeout(t); t = setTimeout(() => b.classList.add("tip"), 350); });
  b.addEventListener("mouseleave", () => { clearTimeout(t); b.classList.remove("tip"); });
  b.addEventListener("click", () => { clearTimeout(t); b.classList.remove("tip"); });
}
// the search palette picked one of Islet's tools
window.bridge.onOpenPanel(id => { if (PANELS.includes(id)) { setOpen(true); showPanel(id, false); } });
window.bridge.onGithub(list => {
  if (dndOn || focusing()) return; // Do Not Disturb and focus rounds keep GitHub quiet
  for (const n of list.slice(0, 3)) toast({ app: "GitHub", svg: NOTE_ICONS.github, color: "#24292f", title: n.title, body: `${n.reason} · ${n.repo}`, open: n.url, ms: 7000 });
});

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
    if (s.context) {
      const c = s.context, m = document.createElement("div");
      m.className = "ctx"; m.dataset.level = c.pct >= 85 ? "high" : c.pct >= 65 ? "mid" : "ok";
      m.title = `Context window: ${c.tokens.toLocaleString()} of ${c.limit.toLocaleString()} tokens`;
      m.append(Object.assign(document.createElement("i"), {}), Object.assign(document.createElement("small"), { textContent: `Context ${c.pct}%` }));
      m.firstChild.style.width = c.pct + "%";
      li.append(m);
    }
    return li;
  }));
}
window.bridge.onClaude(() => { if (openPanel === "aiPanel") { drawAi(); drawLimits(); } });
// plan limits (Codex logs them, Claude's come from its usage endpoint) and tracked usage; at most every 30 s
let limitsAt = 0;
const SVGNS = "http://www.w3.org/2000/svg";
async function drawLimits(force) {
  if (!force && Date.now() - limitsAt < 30000) return;
  limitsAt = Date.now();
  const r = await window.bridge.aiLimits().catch(() => null), now = Date.now(), cards = [];
  const until = t => { const m = Math.max(0, Math.round((t - now) / 60000)); return m >= 1440 ? `${Math.round(m / 1440)}d ${Math.round((m % 1440) / 60)}h` : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
  // a ring with rounded ends that fills to pct; null draws an empty track with a number in it
  const ring = (label, pct, center, sub, title) => {
    const box = el("div", { className: "lring", title }), C = 2 * Math.PI * 22;
    box.dataset.level = pct == null ? "none" : pct >= 85 ? "high" : pct >= 65 ? "mid" : "ok";
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", "0 0 52 52");
    for (const cls of ["track", "fill"]) {
      const c = document.createElementNS(SVGNS, "circle");
      for (const [k, v] of Object.entries({ cx: 26, cy: 26, r: 22, class: cls })) c.setAttribute(k, v);
      if (cls === "fill") { c.style.strokeDasharray = C; c.style.strokeDashoffset = C; requestAnimationFrame(() => requestAnimationFrame(() => { c.style.strokeDashoffset = C * (1 - (pct || 0) / 100); })); }
      svg.append(c);
    }
    const mid = el("div", { className: "lmid" }, el("b", { textContent: center }));
    if (pct != null) mid.firstChild.append(el("small", { textContent: "%" }));
    box.append(el("div", { className: "ldial" }, svg, mid), el("div", { className: "ltxt" }, el("b", { textContent: label }), el("small", { textContent: sub })));
    return box;
  };
  const card = (tool, name, note, rings, foot) => {
    const c = el("div", { className: "lcard" }, el("header", {}, el("i"), el("b", { textContent: name }), el("small", { textContent: note })), el("div", { className: "lrings" }, ...rings));
    c.dataset.tool = tool;
    if (foot) c.append(el("p", { textContent: foot }));
    cards.push(c);
  };
  const LBL = { session: "5-hour", week: "Weekly" };
  // Claude: plan percentages when the usage call works, otherwise the tokens counted locally
  const cp = r?.claudePlan, cu = r?.claude;
  if (cp || cu) {
    const rings = ["session", "week"].map(k => {
      const p = cp?.[k], w = cu?.[k];
      return p ? ring(LBL[k], p.pct, String(p.pct), p.resetsAt ? `${until(p.resetsAt)} left` : "used", `Claude ${LBL[k].toLowerCase()} limit`)
        : ring(LBL[k], null, w ? short(w.tokens) : "—", "tokens", `Claude Code tokens in the last ${k === "session" ? "5 hours" : "7 days"}, from local transcripts`);
    });
    const s = cu?.session;
    card("claude", "Claude", cp ? "Plan limits" : "Tracked locally", rings, s && cp ? `${short(s.tokens)} tokens · ${s.turns} replies in the last 5 h` : "");
  }
  const cx = r?.codex;
  if (cx) {
    const rings = ["session", "week"].filter(k => cx[k]).map(k => {
      const w = cx[k], fresh = w.resetsAt && w.resetsAt <= now; // the window rolled over since Codex last ran
      return ring(LBL[k], fresh ? 0 : w.pct, String(fresh ? 0 : w.pct), fresh ? "fresh" : w.resetsAt ? `${until(w.resetsAt)} left` : "used", `Codex ${LBL[k].toLowerCase()} limit, as Codex last reported it`);
    });
    card("codex", "Codex", cx.at ? `Updated ${now - cx.at >= 864e5 ? `${Math.round((now - cx.at) / 864e5)}d ago` : ago(now - cx.at) === "now" ? "now" : `${ago(now - cx.at)} ago`}` : "Plan limits", rings);
  }
  $("aiLimits").replaceChildren(...cards);
  $("aiLimits").hidden = !cards.length;
}
function short(n) { return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n); }

// a custom pet's sprite sheet steps through its frames; the cat animates with CSS instead
// only the pet on screen is animated: the pill's while closed, the walker in the open view
setInterval(() => {
  if (!theme.petPack || theme.pet === false || document.hidden) return;
  const open = notch.classList.contains("open");
  window.Pet.tick([open ? (notch.classList.contains("dash") ? null : $("fullPet")) : notch.classList.contains("showtime") ? $("stagePet") : $("pillPet")].filter(Boolean), Date.now());
}, 125);

// ---- the window's shape follows the notch (shape.js in main): only the notch takes the mouse, so a file
// dragged onto the pill lands without hovering first. Sent on every size change, also mid-animation ----
let boxSent = "";
function sendBox() {
  const r = notch.getBoundingClientRect();
  const box = { x: Math.max(0, Math.round(r.left)), width: Math.round(r.width), height: Math.round(r.bottom) };
  const key = `${box.x},${box.width},${box.height}`;
  if (key !== boxSent) { boxSent = key; window.bridge.notchBox(box); }
}
new ResizeObserver(sendBox).observe(notch);
sendBox();
