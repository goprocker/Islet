// Quick notes: one plain-text scratchpad in userData/notes.txt.
const fs = require("fs");
const path = require("path");

const MAX = 20000;
const file = dir => path.join(dir, "notes.txt");

function loadNotes(dir) {
  try { return fs.readFileSync(file(dir), "utf8").slice(0, MAX); } catch { return ""; }
}

// returns the text as stored (clamped); a write error is logged, never thrown
function saveNotes(dir, text) {
  const t = typeof text === "string" ? text.slice(0, MAX) : "";
  try { fs.writeFileSync(file(dir), t); } catch (e) { console.warn("notes", e.message); }
  return t;
}

module.exports = { loadNotes, saveNotes, MAX };
