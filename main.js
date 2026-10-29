const { app, BrowserWindow, globalShortcut, ipcMain, screen, Tray, Menu, nativeImage, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const spotify = require("./spotify-web");
const notifications = require("./notifications");
const calendar = require("./calendar");
const icons = require("./icons");
const bridge = require("./claude-bridge");

const W = 540, H = 190;
const PS = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"];
const MEDIA = [...PS, path.join(__dirname, "media.ps1")];
let win, tray, media, audio;

if (!app.requestSingleInstanceLock()) app.quit();

// ---- settings (userData/config.json) ----
const configPath = () => path.join(app.getPath("userData"), "config.json");
const DEFAULTS = { spotifyClientId: "", calendarIcsUrl: "", displayId: null, notifications: true };
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
  win.setBounds({ x: Math.round(bounds.x + (bounds.width - W) / 2), y: bounds.y, width: W, height: H });
}
function createWindow() {
  win = new BrowserWindow({
    width: W, height: H,
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
let lastTitle = "", spotifyIconSent = false;
function startMedia() {
  media = spawn("powershell.exe", [...MEDIA, "watch"], { windowsHide: true });
  lines(media.stdout, l => {
    let d; try { d = JSON.parse(l); } catch { return; }
    if (d.active && !spotifyIconSent) {
      spotifyIconSent = true;
      icons.forSpotify().then(icon => icon ? send("spotifyIcon", icon) : (spotifyIconSent = false));
    }
    send("media", d);
    const key = d.active ? `${d.title}|${d.artist}` : "";
    if (key !== lastTitle) { lastTitle = key; refreshSpotifyExtras(); }
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
ipcMain.on("volume", (_, delta) => {
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
  return { id: t.p, project: cwd ? path.basename(cwd) : "Claude", cwd, status, actions, time: actions[0].time };
}
let lastClaude = "";
function readClaude() {
  // one entry per project: its most recent session
  const byProject = new Map();
  for (const t of recentTranscripts().slice(0, 12)) {
    const s = readSession(t);
    if (s && !byProject.has(s.project)) byProject.set(s.project, s);
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
  });
  // hooks are installed once automatically; the tray item can remove them
  const flag = path.join(app.getPath("userData"), "hooks-set");
  if (!fs.existsSync(flag)) {
    try { bridge.install(); } catch (e) { console.warn("hook install", e.message); }
    fs.writeFileSync(flag, "1");
  }
}
ipcMain.on("openProject", (_, cwd) => { if (cwd && fs.existsSync(cwd)) shell.openPath(cwd); });

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
      label: "Show on screen", enabled: displays.length > 1, submenu: displays.map((d, i) => ({
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
      label: "Connect to Claude Code (exact status + Allow/Deny)", type: "checkbox", checked: bridge.installed(),
      click: () => { try { bridge.installed() ? bridge.uninstall() : bridge.install(); } catch (e) { console.warn(e.message); } buildMenu(); },
    },
    { label: "Show notifications", type: "checkbox", checked: config.notifications, click: () => { config.notifications = !config.notifications; saveConfig(); } },
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
  win.webContents.on("did-finish-load", () => {
    lastClaude = ""; spotifyIconSent = false; readClaude(); refreshSpotifyExtras(); send("timer", timerEnd);
    calendar.poll(config.calendarIcsUrl, ev => send("calendar", ev));
  });
  setInterval(readClaude, 2000);
  setInterval(refreshSpotifyExtras, 30000);
  notifications.watch(async ({ aumid, xml, ...n }) => {
    if (!config.notifications) return;
    send("notification", { ...n, icon: await icons.forNotification(aumid, xml) });
  });
  // reload settings when the file is edited by hand
  fs.watchFile(configPath(), { interval: 2000 }, () => {
    const oldUrl = config.calendarIcsUrl;
    loadConfig(); buildMenu(); placeWindow();
    if (config.calendarIcsUrl !== oldUrl) calendar.poll(config.calendarIcsUrl, ev => send("calendar", ev));
  });
  screen.on("display-added", () => { buildMenu(); placeWindow(); });
  screen.on("display-removed", () => { buildMenu(); placeWindow(); });
  globalShortcut.register("Control+Alt+N", () => send("toggle"));
});
app.on("window-all-closed", e => e.preventDefault());
app.on("will-quit", () => { globalShortcut.unregisterAll(); media?.kill(); audio?.kill(); });
