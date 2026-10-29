const { app, BrowserWindow, globalShortcut, ipcMain, screen, Tray, Menu, nativeImage, shell, clipboard, dialog } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const spotify = require("./spotify-web");
const notifications = require("./notifications");
const calendar = require("./calendar");
const icons = require("./icons");
const bridge = require("./claude-bridge");
const lyrics = require("./lyrics");
const weather = require("./weather");
const downloads = require("./downloads");

const BASE_W = 672, BASE_H = 190;
const SCALES = { compact: 0.85, normal: 1, large: 1.2 };
const scale = () => SCALES[config.size] || 1;
const PS = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"];
const MEDIA = [...PS, path.join(__dirname, "media.ps1")];
let win, tray, media, audio;

// a second copy exits at once (quit() is async and would start helpers first)
if (!app.requestSingleInstanceLock()) app.exit(0);
// starting Islet again while it runs opens its settings
app.on("second-instance", () => openSettings());

// ---- settings (userData/config.json) ----
const configPath = () => path.join(app.getPath("userData"), "config.json");
const DEFAULTS = { spotifyClientId: "", calendarIcsUrl: "", displayId: null, notifications: true, hideInFullscreen: true, lyrics: true, permissionWaitSeconds: 8, dnd: false, dndFrom: "", dndTo: "", clipboardHistory: true, weatherCity: "", weatherUnit: "C", downloadsFolder: "", size: "normal", accent: "album", idleHide: false, hideWindowsBanners: true };
let config = { ...DEFAULTS };
function loadConfig() {
  try { config = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(configPath(), "utf8")) }; } catch { saveConfig(); }
}
function saveConfig() { fs.writeFileSync(configPath(), JSON.stringify(config, null, 2)); }
const send = (ch, d) => win?.webContents.send(ch, d);

// ---- window, on the chosen monitor ----
function targetDisplay() {
  return screen.getAllDisplays().find(d => d.id === config.displayId) || screen.getPrimaryDisplay();
}
function placeWindow() {
  const { bounds } = targetDisplay();
  const W = Math.round(BASE_W * scale()), H = Math.round(BASE_H * scale());
  win.setBounds({ x: Math.round(bounds.x + (bounds.width - W) / 2), y: bounds.y, width: W, height: H });
  win.webContents.setZoomFactor(scale());
}
function createWindow() {
  win = new BrowserWindow({
    width: BASE_W, height: BASE_H,
    frame: false, transparent: true, resizable: false, movable: false,
    skipTaskbar: true, hasShadow: false, focusable: true, show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js") },
  });
  placeWindow();
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true);
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  win.once("ready-to-show", () => win.showInactive());
}

// ---- Spotify via Windows media session ----
function lines(stream, fn) {
  let buf = "";
  stream.on("data", d => {
    buf += d.toString("utf8");
    const parts = buf.split("\n");
    buf = parts.pop();
    for (const l of parts) if (l.trim()) fn(l.trim());
  });
}
let lastTitle = "", iconFor = null; // player whose logo the page has
function startMedia() {
  media = spawn("powershell.exe", [...MEDIA, "watch"], { windowsHide: true });
  lines(media.stdout, l => {
    let d; try { d = JSON.parse(l); } catch { return; }
    // logo of whichever player is shown (Spotify, a browser, VLC...)
    if (d.active && d.source && d.source !== iconFor) {
      const src = iconFor = d.source;
      (/spotify/i.test(src) ? icons.forSpotify() : icons.forNotification(src))
        .then(icon => send("spotifyIcon", icon || null));
    }
    send("media", d);
    const key = d.active ? `${d.title}|${d.artist}` : "";
    if (key !== lastTitle) {
      lastTitle = key;
      refreshSpotifyExtras();
      send("lyrics", null);
      if (d.active && config.lyrics && d.title && d.duration > 30) {
        lyrics.get(d.title, d.artist || "", d.duration).then(l => { if (lastTitle === key) send("lyrics", l); });
      }
    }
  });
  media.on("exit", () => { if (!app.isQuitting) setTimeout(startMedia, 2000); });
}
ipcMain.on("control", (_, cmd) => {
  if (["toggle", "next", "prev"].includes(cmd)) spawn("powershell.exe", [...MEDIA, cmd], { windowsHide: true });
});
ipcMain.on("seek", (_, sec) => {
  if (Number.isFinite(sec)) spawn("powershell.exe", [...MEDIA, "seek", String(Math.max(0, sec))], { windowsHide: true });
});

// ---- Spotify-only audio: wave levels + volume (C# run through signed PowerShell) ----
function startAudio() {
  audio = spawn("powershell.exe", [...PS, path.join(__dirname, "spotify-audio.ps1")], { windowsHide: true });
  let latest = null;
  lines(audio.stdout, l => {
    if (l.startsWith("VOL ")) send("volume", Number(l.slice(4)));
    else latest = l;
  });
  // forward only the newest levels, at most ~30/s
  const timer = setInterval(() => { if (latest) { send("levels", latest.split(",").map(Number)); latest = null; } }, 33);
  audio.on("exit", () => { clearInterval(timer); if (!app.isQuitting) setTimeout(startAudio, 2000); });
}
// ---- mic / camera / screen capture in use + fullscreen apps ----
let sys, fullscreen = false;
function startSystem() {
  sys = spawn("powershell.exe", [...PS, path.join(__dirname, "system.ps1")], { windowsHide: true });
  lines(sys.stdout, l => {
    let d; try { d = JSON.parse(l); } catch { return; }
    send("system", d);
    fullscreen = d.fullscreen;
    applyVisibility();
  });
  sys.on("exit", () => { if (!app.isQuitting) setTimeout(startSystem, 2000); });
}
// out of the way during games and videos (unless turned off in settings)
function applyVisibility() {
  if (!win) return;
  const hide = fullscreen && config.hideInFullscreen;
  if (hide && win.isVisible()) win.hide();
  else if (!hide && !win.isVisible()) win.showInactive();
}

ipcMain.on("volume",(_, delta) => {
  if (Number.isFinite(delta)) audio?.stdin.write(`vol ${delta}\n`);
});

// ---- Spotify Web API: like + up next ----
async function refreshSpotifyExtras() {
  if (!spotify.connected()) return send("spotifyExtras", { connected: false });
  try { send("spotifyExtras", { connected: true, ...(await spotify.extras()) }); }
  catch (e) { console.warn("spotify web", e.message); }
}
ipcMain.on("like", async () => {
  // Web API needs a Premium developer account; without it, use Spotify's own shortcut
  if (!spotify.connected()) return spawn("powershell.exe", [...MEDIA, "like"], { windowsHide: true });
  try { await spotify.toggleLike(); refreshSpotifyExtras(); } catch (e) { console.warn("like", e.message); }
});

// ---- Claude Code: every session active in the last 30 min ----
const projectsDir = path.join(os.homedir(), ".claude", "projects");
function recentTranscripts() {
  const found = [];
  const walk = dir => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".jsonl")) {
        const m = fs.statSync(p).mtimeMs;
        if (Date.now() - m < 30 * 60 * 1000) found.push({ p, m });
      }
    }
  };
  walk(projectsDir);
  return found.sort((a, b) => b.m - a.m);
}
function describe(block) {
  const i = block.input || {};
  const file = i.file_path ? path.basename(i.file_path) : "";
  switch (block.name) {
    case "Edit": case "MultiEdit": return `Edited ${file}`;
    case "Write": return `Wrote ${file}`;
    case "Read": return `Read ${file}`;
    case "Bash": case "PowerShell": return i.description || `Ran ${String(i.command || "").slice(0, 60)}`;
    case "Grep": case "Glob": return `Searched for ${i.pattern}`;
    case "WebSearch": return `Searched the web for ${i.query}`;
    case "WebFetch": return `Fetched ${i.url}`;
    case "Agent": case "Task": return `Started agent: ${i.description || ""}`;
    case "apply_patch": {
      // Codex edits: "*** Update File: src/a.js" lines in the patch
      const files = [...String(i.command || i.input || "").matchAll(/\*\*\* (?:Update|Add) File: (.+)/g)].map(m => path.basename(m[1].trim()));
      return files.length ? `Edited ${files.join(", ")}` : "Edited files";
    }
    default: return `Used ${block.name}`;
  }
}
function readSession(t) {
  let text;
  try {
    const size = fs.statSync(t.p).size, len = Math.min(size, 256 * 1024);
    const fd = fs.openSync(t.p, "r"), b = Buffer.alloc(len);
    fs.readSync(fd, b, 0, len, size - len); fs.closeSync(fd);
    text = b.toString("utf8");
  } catch { return null; }
  const entries = [];
  for (const l of text.split("\n").reverse()) {
    try { const e = JSON.parse(l); if (e.type === "assistant" || e.type === "user") entries.push(e); } catch {}
  }
  if (!entries.length) return null;
  const sessionId = path.basename(t.p, ".jsonl");
  // status from the very last entry + how long the transcript has been quiet:
  // a tool call nobody answered for a while usually means a permission prompt
  const last = entries[0];
  const idle = Date.now() - t.m;
  let status = "working";
  if (last.type === "assistant" && Array.isArray(last.message?.content)) {
    const tool = last.message.content.find(b => b.type === "tool_use");
    const hasTool = !!tool;
    // shell commands can legitimately run a while; give them longer before assuming a prompt
    const wait = ["Bash", "PowerShell"].includes(tool?.name) ? 30000 : 6000;
    if (hasTool && idle > wait) status = "waiting";
    else if (!hasTool && idle > 4000) status = "done";
  }
  // exact status from Claude Code hooks beats the guess
  const hooked = bridge.status.get(sessionId);
  if (hooked) {
    if (hooked.status === "ended") return null;
    status = hooked.status;
  }
  const actions = [];
  let cwd = "";
  for (const e of entries) {
    cwd ||= e.cwd || "";
    if (e.type !== "assistant" || !Array.isArray(e.message?.content)) continue;
    const blocks = e.message.content;
    const tool = [...blocks].reverse().find(b => b.type === "tool_use");
    const txt = blocks.find(b => b.type === "text" && b.text.trim());
    const action = tool ? describe(tool) : txt ? txt.text.replace(/\s+/g, " ").slice(0, 120) : null;
    if (action && actions[actions.length - 1]?.action !== action) actions.push({ action, time: Date.parse(e.timestamp) || t.m });
    if (actions.length === 3) break;
  }
  if (!actions.length) return null;
  return { id: t.p, agent: "claude", project: cwd ? path.basename(cwd) : "Claude", cwd, status, actions, time: actions[0].time };
}
// Codex sessions come straight from its hooks (claude-bridge.js)
function codexSessions() {
  const out = [];
  for (const [id, s] of bridge.codex) {
    if (Date.now() - s.at > 30 * 60 * 1000) { bridge.codex.delete(id); continue; }
    const actions = s.actions.map(a => ({ action: a.text ? a.text.replace(/\s+/g, " ").slice(0, 120) : describe({ name: a.tool, input: a.toolInput || {} }), time: a.time }));
    if (!actions.length) actions.push({ action: "Started", time: s.at });
    out.push({ id, agent: "codex", project: s.cwd ? path.basename(s.cwd) : "Codex", cwd: s.cwd, status: s.status, actions, time: s.at });
  }
  return out;
}
let lastClaude = "";
function readClaude() {
  // one entry per agent + project: its most recent session; Claude and Codex mixed, newest first
  const byProject = new Map();
  const all = [...recentTranscripts().slice(0, 12).map(readSession), ...codexSessions()].filter(Boolean);
  for (const s of all.sort((a, b) => b.time - a.time)) {
    const key = `${s.agent}:${s.project}`;
    if (!byProject.has(key)) byProject.set(key, s);
  }
  const sessions = [...byProject.values()].slice(0, 5);
  const key = JSON.stringify(sessions);
  if (key !== lastClaude) { lastClaude = key; send("claude", sessions); }
}
ipcMain.on("permissionAnswer", (_, id, decision) => bridge.answer(id, decision, gone => send("permissionGone", gone)));
function startBridge() {
  bridge.start({
    onStatus: () => { lastClaude = ""; readClaude(); },
    onPermission: p => send("permission", p),
    onPermissionGone: id => send("permissionGone", id),
    permissionWait: () => Number(config.permissionWaitSeconds ?? 8) * 1000,
  });
  // hooks are installed once automatically; the tray item can remove them
  const flag = path.join(app.getPath("userData"), "hooks-set");
  if (!fs.existsSync(flag)) {
    try { bridge.install(); } catch (e) { console.warn("hook install", e.message); }
    fs.writeFileSync(flag, "1");
  }
  // Codex support came later: add its hooks once for people who already had Claude's
  const codexFlag = path.join(app.getPath("userData"), "codex-hooks-set");
  if (!fs.existsSync(codexFlag) && bridge.installed()) {
    try { bridge.install(); } catch (e) { console.warn("codex hook install", e.message); }
    fs.writeFileSync(codexFlag, "1");
  }
}
// clicked notification: open its link, or bring up the app that sent it
const notifTargets = new Map();
let notifCount = 0;
ipcMain.on("openNotification", (_, id) => {
  const t = notifTargets.get(id);
  if (!t) return;
  if (t.file) shell.showItemInFolder(t.file);
  else if (t.url && /^(https?|ms-[\w-]+|whatsapp|tg|slack|discord|msteams|mailto):/i.test(t.url)) shell.openExternal(t.url);
  // AUMIDs (Store apps and Start Menu apps) open through the Apps folder
  else if (t.aumid && !/\\/.test(t.aumid)) spawn("explorer.exe", [`shell:AppsFolder\\${t.aumid}`], { detached: true });
  else if (t.aumid) spawn(t.aumid.replace(/^\{[^}]+\}\\/, process.env.WINDIR + "\\System32\\"), [], { detached: true });
});
ipcMain.on("openProject", (_, cwd) => { if (cwd && fs.existsSync(cwd)) shell.openPath(cwd); });

// ---- Do Not Disturb: manual switch, or a daily window like 22:00 -> 07:00 ----
function dndActive() {
  if (config.dnd) return true;
  const mins = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const from = mins(config.dndFrom), to = mins(config.dndTo);
  if (from === null || to === null || from === to) return false;
  const d = new Date(), now = d.getHours() * 60 + d.getMinutes();
  return from < to ? now >= from && now < to : now >= from || now < to; // window may cross midnight
}
let lastDnd = null;
function sendDnd(force) {
  const on = dndActive();
  if (force || on !== lastDnd) { lastDnd = on; send("dnd", on); if (tray) buildMenu(); }
}
ipcMain.on("toggleDnd", () => { config.dnd = !config.dnd; saveConfig(); sendDnd(); });

// ---- clipboard history: last 5 copied texts, kept in memory only ----
let clips = [], lastClip = clipboard.readText();
function pollClipboard() {
  if (!config.clipboardHistory) { if (clips.length) { clips = []; send("clipboard", []); } return; }
  const t = clipboard.readText();
  if (!t || t === lastClip || t.length > 20000) { lastClip = t; return; }
  lastClip = t;
  clips = [t, ...clips.filter(c => c !== t)].slice(0, 5);
  send("clipboard", clips.map(c => c.replace(/\s+/g, " ").slice(0, 160)));
}
ipcMain.on("copyClip", (_, i) => { if (clips[i] !== undefined) { clipboard.writeText(clips[i]); lastClip = clips[i]; } });
ipcMain.on("clearClips", () => { clips = []; send("clipboard", []); });

// ---- file shelf: hold files here, drag them out anywhere ----
const shelfPath = () => path.join(app.getPath("userData"), "shelf.json");
let shelf = []; // [{ path, name, icon: dataURL }]
const dragIcons = new Map();
async function shelfAdd(paths) {
  for (const p of paths) {
    if (!p || shelf.some(f => f.path === p) || !fs.existsSync(p)) continue;
    let img = null;
    try { img = await app.getFileIcon(p, { size: "normal" }); } catch {}
    dragIcons.set(p, img);
    shelf.push({ path: p, name: path.basename(p), icon: img?.toDataURL() || null });
  }
  saveShelf();
}
function saveShelf() {
  shelf = shelf.filter(f => fs.existsSync(f.path)).slice(-12);
  fs.writeFileSync(shelfPath(), JSON.stringify(shelf.map(f => f.path)));
  send("shelf", shelf);
}
async function loadShelf() {
  let paths = [];
  try { paths = JSON.parse(fs.readFileSync(shelfPath(), "utf8")); } catch {}
  shelf = [];
  await shelfAdd(paths);
}
ipcMain.on("shelfAdd", (_, paths) => shelfAdd(Array.isArray(paths) ? paths : []));
ipcMain.on("shelfPick", async () => {
  const r = await dialog.showOpenDialog({ title: "Add files to the Islet shelf", properties: ["openFile", "multiSelections"] });
  if (!r.canceled) shelfAdd(r.filePaths);
});
ipcMain.on("shelfRemove", (_, p) => { shelf = shelf.filter(f => f.path !== p); saveShelf(); });
ipcMain.on("shelfOpen", (_, p) => { if (shelf.some(f => f.path === p)) shell.showItemInFolder(p); });
ipcMain.on("shelfDrag", (e, p) => {
  if (!shelf.some(f => f.path === p)) return;
  const icon = dragIcons.get(p);
  e.sender.startDrag({ file: p, icon: icon && !icon.isEmpty() ? icon : nativeImage.createFromDataURL(EMPTY_PNG) });
});
// 1x1 transparent fallback: startDrag needs some icon
const EMPTY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

// ---- settings window ----
let settingsWin = null;
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) return settingsWin.focus();
  settingsWin = new BrowserWindow({
    width: 600, height: 760, title: "Islet settings", backgroundColor: "#0b0b0c", autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "settings", "preload.js") },
  });
  settingsWin.loadFile(path.join(__dirname, "settings", "settings.html"));
}
const settingsView = () => ({ ...config, hooks: bridge.installed(), login: login() });
ipcMain.handle("settings:load", () => settingsView());
ipcMain.handle("settings:save", (_, v) => {
  // only known keys, each checked; the form can't write anything else
  const str = (x, max = 2000) => (typeof x === "string" ? x.trim().slice(0, max) : "");
  const time = x => (/^\d{2}:\d{2}$/.test(x) ? x : "");
  const next = {
    ...config,
    size: ["compact", "normal", "large"].includes(v.size) ? v.size : "normal",
    accent: /^#[0-9a-f]{6}$/i.test(v.accent) ? v.accent : "album",
    idleHide: !!v.idleHide, hideInFullscreen: !!v.hideInFullscreen,
    notifications: !!v.notifications, hideWindowsBanners: !!v.hideWindowsBanners, dnd: !!v.dnd, dndFrom: time(v.dndFrom), dndTo: time(v.dndTo),
    permissionWaitSeconds: Math.min(24, Math.max(0, Math.round(Number(v.permissionWaitSeconds) || 0))),
    lyrics: !!v.lyrics, spotifyClientId: str(v.spotifyClientId, 100),
    weatherCity: str(v.weatherCity, 100), weatherUnit: v.weatherUnit === "F" ? "F" : "C",
    calendarIcsUrl: /^(https?|webcal):\/\//i.test(str(v.calendarIcsUrl)) ? str(v.calendarIcsUrl).replace(/^webcal:/i, "https:") : "",
    downloadsFolder: str(v.downloadsFolder, 500), clipboardHistory: !!v.clipboardHistory,
  };
  config = next;
  saveConfig(); // the settings-file watcher applies everything
  if (!!v.hooks !== bridge.installed()) { try { v.hooks ? bridge.install() : bridge.uninstall(); } catch (e) { console.warn(e.message); } }
  if (!!v.login !== login()) setLogin(!!v.login);
  buildMenu();
  return settingsView();
});

// ---- look: size, accent colour, hide when idle ----
function sendTheme() {
  win?.webContents.setZoomFactor(scale());
  send("theme", { accent: /^#[0-9a-f]{6}$/i.test(config.accent) ? config.accent : "album", idleHide: !!config.idleHide });
}

// ---- Windows banners: off while Islet shows notifications itself ----
const bannersPath = () => path.join(app.getPath("userData"), "banners.json");
let bannersSaved = null;
function applyBanners(newIds) {
  if (!bannersSaved) { try { bannersSaved = JSON.parse(fs.readFileSync(bannersPath(), "utf8")); } catch { bannersSaved = {}; } }
  const want = config.notifications && config.hideWindowsBanners;
  const before = Object.keys(bannersSaved).length;
  if (want) notifications.hideBanners(bannersSaved, newIds);
  else notifications.restoreBanners(bannersSaved);
  if (Object.keys(bannersSaved).length !== before) fs.writeFileSync(bannersPath(), JSON.stringify(bannersSaved, null, 2));
}

// ---- move to the next screen (tray menu or Ctrl+Alt+M) ----
function nextScreen() {
  const all = screen.getAllDisplays();
  if (all.length < 2) return;
  const i = all.findIndex(d => d.id === targetDisplay().id);
  config.displayId = all[(i + 1) % all.length].id;
  saveConfig(); placeWindow(); buildMenu();
}

// ---- weather + downloads ----
function startWeather() { weather.poll(config.weatherCity.trim(), config.weatherUnit, w => send("weather", w)); }
function startDownloads() {
  const dir = config.downloadsFolder || app.getPath("downloads");
  downloads.watch(dir, list => send("downloads", list), done => {
    const id = ++notifCount;
    notifTargets.set(id, { file: done.path });
    send("downloadDone", { id, name: done.name });
  });
}

// ---- timer ----
let timerEnd = 0, timerDone;
function setTimer(min) {
  timerEnd = min ? Date.now() + min * 60000 : 0;
  send("timer", timerEnd); buildMenu();
  // the page shows "Time's up" itself; here just mark it finished afterwards
  clearTimeout(timerDone);
  if (min) timerDone = setTimeout(() => { timerEnd = 0; buildMenu(); }, min * 60000 + 2000);
}

// ---- login item ----
// unpackaged, electron.exe needs the app folder as an argument or it opens its default app
const loginOpts = { path: process.execPath, args: app.isPackaged ? [] : [path.resolve(__dirname)] };
const login = () => app.getLoginItemSettings(loginOpts).openAtLogin;
const setLogin = on => app.setLoginItemSettings({ ...loginOpts, openAtLogin: on });
function enableLoginOnFirstRun() {
  const flag = path.join(app.getPath("userData"), app.isPackaged ? "login-set-installed" : "login-set");
  if (fs.existsSync(flag)) return;
  setLogin(true);
  fs.writeFileSync(flag, "1");
}

// ---- tray ----
function buildMenu() {
  const displays = screen.getAllDisplays();
  const current = targetDisplay().id;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show / hide Islet  (Ctrl+Alt+N)", click: () => send("toggle") },
    {
      label: timerEnd ? "Timer (running)" : "Timer", submenu: [
        ...[5, 15, 25, 50].map(m => ({ label: `${m} minutes`, click: () => setTimer(m) })),
        { type: "separator" },
        { label: "Cancel timer", enabled: !!timerEnd, click: () => setTimer(0) },
      ],
    },
    {
      label: "Show on screen (Ctrl+Alt+M: next)", enabled: displays.length > 1, submenu: displays.map((d, i) => ({
        label: `Screen ${i + 1} (${d.size.width}×${d.size.height})`, type: "radio", checked: d.id === current,
        click: () => { config.displayId = d.id; saveConfig(); placeWindow(); },
      })),
    },
    { type: "separator" },
    spotify.connected()
      ? { label: "Disconnect Spotify account", click: () => { spotify.disconnect(); refreshSpotifyExtras(); buildMenu(); } }
      : {
        label: config.spotifyClientId ? "Connect Spotify account…" : "Connect Spotify account (Premium only; Client ID in settings)",
        enabled: !!config.spotifyClientId,
        click: async () => {
          try { await spotify.connect(config.spotifyClientId); } catch (e) { console.warn("spotify login", e.message); }
          refreshSpotifyExtras(); buildMenu();
        },
      },
    {
      label: "Connect to Claude Code and Codex", type: "checkbox", checked: bridge.installed(),
      click: () => { try { bridge.installed() ? bridge.uninstall() : bridge.install(); } catch (e) { console.warn(e.message); } buildMenu(); },
    },
    { label: "Do Not Disturb", type: "checkbox", checked: dndActive(), click: () => { config.dnd = !config.dnd; saveConfig(); sendDnd(); } },
    { label: "Show notifications", type: "checkbox", checked: config.notifications, click: () => { config.notifications = !config.notifications; saveConfig(); applyBanners(); } },
    { label: "Settings…", click: openSettings },
    { label: "Open settings file", click: () => shell.openPath(configPath()) },
    { label: "Start with Windows", type: "checkbox", checked: login(), click: () => { setLogin(!login()); buildMenu(); } },
    { type: "separator" },
    { label: "Quit", click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}
function makeTray() {
  const s = 16, px = Buffer.alloc(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const inside = Math.abs(y - 8) < 4 && Math.abs(x - 8) < 7;
    px.fill(inside ? 255 : 0, (y * s + x) * 4, (y * s + x) * 4 + 4);
  }
  tray = new Tray(nativeImage.createFromBitmap(px, { width: s, height: s }));
  tray.setToolTip("Islet");
  buildMenu();
}

app.whenReady().then(() => {
  loadConfig();
  spotify.init(app.getPath("userData"));
  ipcMain.on("hover", (_, over) => win.setIgnoreMouseEvents(!over, { forward: true }));
  enableLoginOnFirstRun();
  createWindow();
  startBridge();
  makeTray();
  startMedia();
  startAudio();
  startSystem();
  win.webContents.on("did-finish-load", () => {
    lastClaude = ""; iconFor = null; readClaude(); refreshSpotifyExtras(); send("timer", timerEnd); sendDnd(true); send("shelf", shelf); sendTheme();
    send("clipboard", clips.map(c => c.replace(/\s+/g, " ").slice(0, 160)));
    calendar.poll(config.calendarIcsUrl, ev => send("calendar", ev));
    startWeather();
  });
  startDownloads();
  setInterval(readClaude, 2000);
  setInterval(refreshSpotifyExtras, 30000);
  setInterval(sendDnd, 30000); // schedule edges
  setInterval(pollClipboard, 1000);
  loadShelf();
  applyBanners();
  notifications.watch(async ({ aumid, xml, ...n }) => {
    if (aumid && bannersSaved && !(aumid in bannersSaved)) applyBanners([aumid]); // an app seen for the first time
    if (!config.notifications || dndActive()) return;
    // what a click opens: the toast's own link when it has one, else the app
    const launch = xml.match(/<toast[^>]*\blaunch="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&");
    const protocol = /<toast[^>]*activationType="protocol"/.test(xml) && launch && /^[a-z][\w+.-]*:/i.test(launch);
    const id = ++notifCount;
    notifTargets.set(id, protocol ? { url: launch } : { aumid });
    if (notifTargets.size > 50) notifTargets.delete(notifTargets.keys().next().value);
    send("notification", { ...n, id, icon: await icons.forNotification(aumid, xml) });
  });
  // reload settings when the file is edited by hand
  fs.watchFile(configPath(), { interval: 2000 }, () => {
    const oldUrl = config.calendarIcsUrl, old = JSON.stringify([config.weatherCity, config.weatherUnit, config.downloadsFolder]);
    loadConfig(); buildMenu(); placeWindow(); applyVisibility(); sendDnd(); sendTheme(); applyBanners();
    if (config.calendarIcsUrl !== oldUrl) calendar.poll(config.calendarIcsUrl, ev => send("calendar", ev));
    if (old !== JSON.stringify([config.weatherCity, config.weatherUnit, config.downloadsFolder])) { startWeather(); startDownloads(); }
  });
  screen.on("display-added", () => { buildMenu(); placeWindow(); });
  screen.on("display-removed", () => { buildMenu(); placeWindow(); });
  globalShortcut.register("Control+Alt+N", () => send("toggle"));
  globalShortcut.register("Control+Alt+M", nextScreen);
});
app.on("window-all-closed", e => e.preventDefault());
app.on("will-quit", () => { globalShortcut.unregisterAll(); if (bannersSaved) { notifications.restoreBanners(bannersSaved); fs.writeFileSync(bannersPath(), "{}"); } media?.kill(); audio?.kill(); sys?.kill(); });
