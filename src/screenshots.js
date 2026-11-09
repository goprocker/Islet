// New screenshots go on the file shelf. Win+PrtScn and the Snipping Tool both save to
// Pictures\Screenshots; that folder only exists after the first one, so a missing folder
// is retried until it shows up.
const fs = require("fs");
const path = require("path");

const IMAGE = /\.(png|jpe?g|gif|bmp|webp)$/i;
const SETTLE_MS = 400; // the tool writes the file in a few chunks
const RETRY_MS = 30000;
const FRESH_MS = 60000;
let stopCurrent = () => {};

function stop() { stopCurrent(); stopCurrent = () => {}; }

// tracker(dir).next(): images that appeared since the last call. Files already there at the
// start, old files copied in, and empty ones still being written are not announced.
function tracker(dir) {
  const list = () => { try { return fs.readdirSync(dir).filter(n => IMAGE.test(n)); } catch { return null; } };
  const seen = new Set(list() || []);
  return {
    next() {
      const names = list();
      if (!names) return [];
      const out = [];
      for (const n of names) {
        if (seen.has(n)) continue;
        const p = path.join(dir, n);
        let st;
        try { st = fs.statSync(p); } catch { continue; }
        if (!st.size) continue; // not finished: the next change event looks again
        seen.add(n);
        if (Date.now() - st.mtimeMs < FRESH_MS) out.push(p);
      }
      return out;
    },
  };
}

function watch(dir, onNew) {
  stop();
  let watcher = null, timer = null, settle = null;
  const t = tracker(dir);
  const check = () => { for (const p of t.next()) onNew(p); };
  function open() {
    try {
      watcher = fs.watch(dir, () => { clearTimeout(settle); settle = setTimeout(check, SETTLE_MS); });
      watcher.on("error", () => { close(); timer = setTimeout(open, RETRY_MS); });
      check(); // anything saved while there was no watcher
    } catch { watcher = null; timer = setTimeout(open, RETRY_MS); }
  }
  function close() { try { watcher?.close(); } catch {} watcher = null; }
  stopCurrent = () => { clearTimeout(timer); clearTimeout(settle); close(); };
  open();
}

module.exports = { watch, stop, tracker };
