// Quick notes: one plain-text scratchpad in userData/notes.txt.
const fs = require("fs");
const path = require("path");

const MAX = 20000;
const file = dir => path.join(dir, "notes.txt");

function loadNotes(dir) {
  try { return fs.readFileSync(file(dir), "utf8").slice(0, MAX); } catch { return ""; }
}

// write to a temp file and rename it over the old one, so a failed save never damages what was stored
function writeAtomic(f, data) {
  const tmp = f + ".tmp";
  try { fs.writeFileSync(tmp, data); fs.renameSync(tmp, f); }
  catch (e) { try { fs.rmSync(tmp, { force: true }); } catch {} throw e; }
}

// returns the text as stored (clamped); throws when it couldn't be written, keeping the old file
function saveNotes(dir, text) {
  const t = typeof text === "string" ? text.slice(0, MAX) : "";
  writeAtomic(file(dir), t);
  return t;
}

module.exports = { loadNotes, saveNotes, MAX };
