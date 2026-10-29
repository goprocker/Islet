// Browser downloads in progress, from their temporary files in the Downloads
// folder: Chrome/Edge ".crdownload", Firefox ".part", Edge legacy ".partial".
// Browsers don't write the final size anywhere we can read, so we show the
// size so far, and announce the file that appears when the temp file goes.
const fs = require("fs");
const path = require("path");

const TEMP = /\.(crdownload|part|partial|download)$/i;
let timer = null;

function watch(dir, onChange, onDone) {
  clearInterval(timer);
  let active = new Map(); // temp file -> bytes
  const scan = () => {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { return; }
    const now = new Map();
    for (const n of names) {
      if (!TEMP.test(n)) continue;
      try {
        const st = fs.statSync(path.join(dir, n));
        // cancelled downloads leave temp files behind; only count ones still growing
        if (Date.now() - st.mtimeMs < 60000) now.set(n, st.size);
      } catch {}
    }
    // a temp file that vanished = finished (or cancelled): find the newest real file
    for (const gone of active.keys()) {
      if (now.has(gone)) continue;
      const guess = gone.replace(TEMP, "");
      let best = null;
      for (const n of names) {
        if (TEMP.test(n)) continue;
        try {
          const st = fs.statSync(path.join(dir, n));
          if (Date.now() - st.mtimeMs < 15000 && (!best || st.mtimeMs > best.m || n === guess)) best = { n, m: st.mtimeMs };
        } catch {}
      }
      if (best) onDone({ name: best.n, path: path.join(dir, best.n) });
    }
    const changed = now.size !== active.size || [...now].some(([n, b]) => active.get(n) !== b);
    active = now;
    if (changed) onChange([...now].map(([n, bytes]) => ({ name: n.replace(TEMP, "").replace(/^Unconfirmed \d+$/, "Download"), bytes })));
  };
  scan();
  timer = setInterval(scan, 1500);
}

module.exports = { watch };
