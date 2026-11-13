// openProject may only open a folder that an agent session actually reported as its working
// directory. shell.openPath runs the default handler, so an .exe or script path would launch it.
const fs = require("fs");
const path = require("path");

const key = p => path.resolve(p).toLowerCase();

// the folder to open, or null when the path isn't a reported session folder or isn't a folder
function projectToOpen(cwd, known, stat = fs.statSync) {
  if (typeof cwd !== "string" || !cwd || !path.isAbsolute(cwd)) return null;
  if (![...known].some(k => typeof k === "string" && k && key(k) === key(cwd))) return null;
  try { return stat(cwd).isDirectory() ? path.resolve(cwd) : null; } catch { return null; }
}

module.exports = { projectToOpen };
