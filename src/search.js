// Universal search: the matching and the app index. The sources (clipboard, notes) and the
// actions live in main.js; this file has no Electron in it so it can be tested alone.
const fs = require("fs");
const path = require("path");

// 0 = no match; higher is better: exact, prefix, word prefix, substring, letters in order
function score(query, text) {
  const q = query.trim().toLowerCase(), t = String(text).toLowerCase();
  if (!q) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  if (t.split(/[\s\-_.()]+/).some(w => w.startsWith(q))) return 75;
  if (t.includes(q)) return 60;
  // letters in order, but close together: "chrm" finds Chrome, "wifi" must not find a long unrelated name
  if (q.length < 3) return 0;
  let i = 0, first = -1;
  for (let j = 0; j < t.length; j++) {
    if (t[j] !== q[i]) continue;
    if (i === 0) first = j;
    if (++i === q.length) return j - first + 1 <= q.length * 2 ? 40 : 0;
  }
  return 0;
}

// best items for the query: each has a title and optional keywords (other words that find it).
// Ties keep the order given, so earlier sources win.
function rank(query, items, limit = 8, minScore = 0) {
  return items
    .map((item, order) => {
      const s = Math.max(score(query, item.title), ...(item.keywords || []).map(k => score(query, k) * 0.9));
      return { item, s, order };
    })
    .filter(r => r.s > 0 && r.s >= minScore)
    .sort((a, b) => b.s - a.s || a.order - b.order)
    .slice(0, limit)
    .map(r => r.item);
}

// Start Menu shortcuts that are real programs: no uninstallers, readmes or help links; one per name
const SKIP = /uninstall|readme|release notes|\bhelp\b|documentation|license|website|changelog/i;
function appsFromLinks(files) {
  const seen = new Set(), apps = [];
  for (const file of files) {
    const name = path.basename(file, ".lnk");
    const key = name.toLowerCase();
    if (SKIP.test(name) || seen.has(key)) continue;
    seen.add(key);
    apps.push({ name, file });
  }
  return apps;
}

// the list from PowerShell's Get-StartApps: [{Name, AppID}], which also has Store apps (Notepad, Calculator)
function appsFromStartApps(list) {
  const seen = new Set(), apps = [];
  for (const a of Array.isArray(list) ? list : [list]) {
    if (!a || typeof a.Name !== "string" || typeof a.AppID !== "string" || !a.Name || !a.AppID) continue;
    const key = a.Name.toLowerCase();
    if (SKIP.test(a.Name) || seen.has(key)) continue;
    seen.add(key);
    apps.push({ name: a.Name, appId: a.AppID });
  }
  return apps;
}

function scanStartMenu(dirs, depth = 3) {
  const out = [];
  const walk = (dir, left) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (left > 0) walk(full, left - 1); }
      else if (/\.lnk$/i.test(e.name)) out.push(full);
    }
  };
  for (const d of dirs) walk(d, depth);
  return appsFromLinks(out);
}

// File and folder names under the given folders, for searching by name. Skips hidden folders and
// bulky ones, goes at most `depth` folders down and stops at `max` entries so a huge disk can't stall it.
const SKIP_DIRS = new Set(["node_modules", "appdata", "$recycle.bin", "__pycache__", "venv", "cache", "temp"]);
async function scanFiles(dirs, { depth = 4, max = 40000 } = {}) {
  const out = [];
  const walk = async (dir, left) => {
    let entries;
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length >= max) return;
      if (e.name.startsWith(".")) continue;
      const full = path.join(dir, e.name);
      out.push({ id: "file:" + full, title: e.name, sub: dir, kind: "file", path: full });
      if (e.isDirectory() && left > 0 && !SKIP_DIRS.has(e.name.toLowerCase())) await walk(full, left - 1);
    }
  };
  for (const d of dirs) await walk(d, depth);
  return out;
}

// apps, commands and the rest first; a few file matches go after them so they never crowd those out
function withFiles(top, files, limit = 8, fileSlots = 3) {
  const f = files.slice(0, fileSlots);
  return [...top.slice(0, limit - f.length), ...f];
}

// things to type: Wi-Fi and Bluetooth, and Islet's own settings
const COMMANDS = [
  { id: "wifi-settings", title: "Wi-Fi settings", sub: "Open Windows network settings", keywords: ["wifi", "wireless", "network", "internet"], uri: "ms-settings:network-wifi" },
  { id: "bluetooth-settings", title: "Bluetooth settings", sub: "Open Bluetooth and devices", keywords: ["bluetooth", "devices", "pair", "airpods"], uri: "ms-settings:bluetooth" },
  { id: "wifi-toggle", title: "Turn Wi-Fi on or off", sub: "Switch the Wi-Fi radio", keywords: ["wifi", "wi-fi", "wireless", "toggle", "airplane"], radio: "wifi" },
  { id: "bluetooth-toggle", title: "Turn Bluetooth on or off", sub: "Switch the Bluetooth radio", keywords: ["bluetooth", "toggle"], radio: "bluetooth" },
  { id: "sound-settings", title: "Sound settings", sub: "Open Windows sound settings", keywords: ["volume", "audio", "speaker", "microphone", "mic"], uri: "ms-settings:sound" },
  { id: "display-settings", title: "Display settings", sub: "Open Windows display settings", keywords: ["brightness", "screen", "monitor", "night light"], uri: "ms-settings:display" },
  { id: "islet-settings", title: "Islet settings", sub: "Open Islet's settings", keywords: ["preferences", "options", "notch"], islet: "settings" },
];

module.exports = { scanFiles, withFiles, score, rank, appsFromLinks, appsFromStartApps, scanStartMenu, COMMANDS };
