// Bluetooth connect / disconnect pop-ups. bt-connect.ps1 runs for as long as Islet does and
// prints the connected device names whenever they change; this turns that into events.
const { spawn } = require("child_process");
const path = require("path");

// one line of output -> sorted list of names, or null for junk
function parseLine(line) {
  let raw;
  try { raw = JSON.parse(String(line).trim()); } catch { return null; }
  if (raw === null) return [];
  return [...new Set([].concat(raw).filter(n => typeof n === "string" && n.trim()).map(n => n.trim().slice(0, 60)))].sort();
}

// what changed between two lists; the first list (prev null) is only a baseline
function diff(prev, next) {
  if (!prev) return { connected: [], disconnected: [] };
  return { connected: next.filter(n => !prev.includes(n)), disconnected: prev.filter(n => !next.includes(n)) };
}

// Each start() is a new run with its own token. A child, its output and its exit only count while
// they belong to the current run and are still that run's child, so a late exit from a watcher that
// stop() killed can't clear the new one or start a second one (#254). "error" and "exit" go through
// one ended() that acts once, so a failed spawn (error and maybe no exit) still retries once.
let current = null; // { child, retry }
function start(onEvent, { script = path.join(__dirname, "bt-connect.ps1"), spawn: spawnFn = spawn, retryMs = 10000 } = {}) {
  stop();
  const me = current = { child: null, retry: null };
  let prev = null, fails = 0;
  const live = () => current === me;
  const run = () => {
    if (!live()) return;
    let buf = "";
    const kid = me.child = spawnFn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, String(process.pid)], { windowsHide: true });
    const mine = () => live() && me.child === kid;
    kid.stdout?.on("data", d => {
      if (!mine()) return;
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const list = parseLine(buf.slice(0, i)); buf = buf.slice(i + 1);
        if (!list) continue;
        fails = 0;
        const { connected, disconnected } = diff(prev, list);
        prev = list;
        for (const name of connected) onEvent({ type: "connected", name });
        for (const name of disconnected) onEvent({ type: "disconnected", name });
      }
    });
    let done = false;
    const ended = () => {
      if (done) return;
      done = true;
      if (!mine()) return;
      me.child = null;
      if (++fails <= 5) me.retry = setTimeout(run, retryMs * fails);
    };
    kid.on("error", ended);
    kid.on("exit", ended);
  };
  run();
}
function stop() {
  const old = current;
  current = null;
  if (!old) return;
  clearTimeout(old.retry);
  const kid = old.child;
  old.child = null;
  if (kid) { try { kid.kill(); } catch {} }
}
const running = () => !!current?.child;

module.exports = { start, stop, running, parseLine, diff };
