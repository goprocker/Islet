// What shelf.json holds: a list of file paths. Anything else is copied aside for a look
// (shelf.json.invalid) and the shelf starts without it.
const fs = require("fs");

function readShelf(file) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch (e) {
    if (e.code !== "ENOENT") console.warn("shelf: can't read:", e.message);
    return [];
  }
  let list = null, problem = "";
  try { list = JSON.parse(text); } catch (e) { problem = `invalid JSON (${e.message})`; }
  if (!problem && !Array.isArray(list)) problem = "not a list";
  const paths = Array.isArray(list) ? list.filter(p => p && typeof p === "string") : [];
  if (!problem && paths.length !== list.length) problem = "some entries aren't paths";
  if (problem) {
    console.warn(`shelf: ${problem}; keeping a copy in shelf.json.invalid`);
    try { fs.copyFileSync(file, file + ".invalid"); } catch (e) { console.warn("shelf:", e.message); }
  }
  return paths;
}

module.exports = { readShelf };
