// Bluetooth battery levels, read by devices.ps1 every two minutes. Getting them takes a few
// seconds of PnP queries, so it runs as a short PowerShell of its own, not in helpers.ps1.
const { execFile } = require("child_process");
const path = require("path");

const EVERY_MS = 120000;
const LOW = 20;
let timer = null;
let low = new Set(); // names already warned about, until they charge back above LOW

// devices.ps1 output -> [{ name, battery }], one per name (a device can show up as several
// Bluetooth nodes), lowest level first so the one that needs charging leads
function parse(out) {
  let raw;
  try { raw = JSON.parse(String(out).trim() || "[]"); } catch { return []; }
  const byName = new Map();
  for (const d of [].concat(raw)) {
    const name = typeof d?.name === "string" ? d.name.trim().slice(0, 60) : "";
    const battery = Number(d?.battery);
    if (!name || !Number.isFinite(battery) || battery < 0 || battery > 100) continue;
    if (!byName.has(name) || battery < byName.get(name)) byName.set(name, Math.round(battery));
  }
  return [...byName].map(([name, battery]) => ({ name, battery })).sort((a, b) => a.battery - b.battery || a.name.localeCompare(b.name));
}

// devices that just went low: each is warned about once, and again only after it charged above LOW
function newlyLow(list, warned = low) {
  const out = [];
  for (const d of list) {
    if (d.battery > LOW) warned.delete(d.name);
    else if (!warned.has(d.name)) { warned.add(d.name); out.push(d); }
  }
  return out;
}

function poll(onList, onLow) {
  stop();
  const run = () => {
    execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "devices.ps1")], { windowsHide: true, timeout: 60000 }, (err, out) => {
      if (timer === null) return; // stopped meanwhile
      if (!err) { const list = parse(out); onList(list); for (const d of newlyLow(list)) onLow(d); }
      timer = setTimeout(run, EVERY_MS);
    });
  };
  timer = setTimeout(run, 0);
}

function stop() { clearTimeout(timer); timer = null; }

module.exports = { poll, stop, parse, newlyLow, LOW };
