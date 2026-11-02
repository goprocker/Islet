// Browser downloads in progress, from their temporary files in the Downloads
// folder: Chrome/Edge ".crdownload", Firefox ".part", Edge legacy ".partial".
// Browsers don't write the final size anywhere we can read, so we show the
// size so far, and announce the file that appears when the temp file goes.
const fs = require("fs");
const path = require("path");

const TEMP = /\.(crdownload|part|partial|download)$/i;
const BUSY_MS = 1500; // Windows can hold back change events for a file still being written
const IDLE_MS = 60000; // only a safety net; the folder watcher does the work
const BURST_MS = 100;
let stopCurrent = () => {};

function stop() { stopCurrent(); stopCurrent = () => {}; }

function watch(dir, onChange, onDone) {
  stop();
  let watcher = null, timer = null, burst = null;
  let active = new Map(); // temp file -> bytes
  let prevReal = null; // real files at the last scan
  let published = false; // a new watch always reports once, even an empty list
  const scan = () => {
    let names = [];
    try { names = fs.readdirSync(dir); } catch {
      // folder gone or unreadable: nothing in it is watched any more
      closeWatcher();
      if (active.size || !published) { active = new Map(); published = true; onChange([]); }
      return;
    }
    const now = new Map();
    for (const n of names) {
      if (!TEMP.test(n)) continue;
      try {
        const st = fs.statSync(path.join(dir, n));
        // cancelled downloads leave temp files behind; only count ones still growing
        if (Date.now() - st.mtimeMs < 60000) now.set(n, st.size);
      } catch {}
    }
    // a temp file that vanished: finished only if its real file shows up. Its own name
    // without the temp extension, or (Chrome's "Unconfirmed 123") a file that is new since
    // the last scan and at least as big. Cancelled or stale ones announce nothing, and no
    // file is announced twice.
    const real = names.filter(n => !TEMP.test(n));
    const claimed = new Set();
    // when a file could be the finished download: its mtime, else null
    const fits = (n, bytes) => {
      if (claimed.has(n)) return null;
      try {
        const st = fs.statSync(path.join(dir, n));
        return Date.now() - st.mtimeMs < 15000 && st.size >= bytes ? st.mtimeMs : null;
      } catch { return null; }
    };
    const claim = n => { claimed.add(n); onDone({ name: n, path: path.join(dir, n) }); };
    // its own name is certain, so those go first
    const unnamed = [];
    for (const [gone, bytes] of active) {
      if (now.has(gone) || names.includes(gone)) continue; // still there, just not growing
      const guess = gone.replace(TEMP, "");
      if (real.includes(guess) && fits(guess, bytes) !== null) claim(guess);
      else if (/^Unconfirmed \d+$/.test(guess)) unnamed.push(bytes);
    }
    // biggest first: it has the fewest files to choose from, so each one gets its own
    for (const bytes of unnamed.sort((a, b) => b - a)) {
      let best = null;
      for (const n of real) {
        if (prevReal.has(n)) continue;
        const m = fits(n, bytes);
        if (m !== null && (!best || m > best.m)) best = { n, m };
      }
      if (best) claim(best.n);
    }
    prevReal = new Set(real);
    const changed = now.size !== active.size || [...now].some(([n, b]) => active.get(n) !== b);
    active = now;
    if (changed || !published) {
      published = true;
      onChange([...now].map(([n, bytes]) => ({ name: n.replace(TEMP, "").replace(/^Unconfirmed \d+$/, "Download"), bytes })));
    }
  };
  function closeWatcher() {
    try { watcher?.close(); } catch {}
    watcher = null;
  }
  function openWatcher() {
    if (watcher) return;
    try {
      watcher = fs.watch(dir, () => { clearTimeout(burst); burst = setTimeout(run, BURST_MS); });
      // the folder went away: keep trying until it's back
      watcher.on("error", () => { closeWatcher(); schedule(); });
    } catch { watcher = null; } // missing for now; the next scan tries again
  }
  // a temp file's size, expiry and disappearance are all polled while one is active.
  // With none, or no working watcher, the timer decides how soon to look again
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(run, watcher && !active.size ? IDLE_MS : BUSY_MS);
  }
  function run() {
    clearTimeout(burst);
    scan();
    openWatcher();
    schedule();
  }
  stopCurrent = () => { clearTimeout(timer); clearTimeout(burst); closeWatcher(); };
  run();
}

module.exports = { watch, stop };
