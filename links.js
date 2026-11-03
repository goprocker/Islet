// Saved links for the Links tool: a short list in userData/links.json, http(s) only.
const fs = require("fs");
const path = require("path");

const MAX = 30;
const file = dir => path.join(dir, "links.json");

// a link is kept only with an http(s) URL; the title falls back to the host name
function clean(l) {
  let u;
  try { u = new URL(String(l?.url || "").trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const title = String(l.title || "").trim().slice(0, 60) || u.hostname.replace(/^www\./, "");
  return { title, url: u.href };
}

function loadLinks(dir) {
  try {
    const list = JSON.parse(fs.readFileSync(file(dir), "utf8"));
    return Array.isArray(list) ? list.map(clean).filter(Boolean).slice(0, MAX) : [];
  } catch { return []; }
}

// returns the list as stored; a write error is logged, never thrown
function saveLinks(dir, list) {
  const out = (Array.isArray(list) ? list : []).map(clean).filter(Boolean).slice(0, MAX);
  try { fs.writeFileSync(file(dir), JSON.stringify(out, null, 1)); } catch (e) { console.warn("links", e.message); }
  return out;
}

module.exports = { loadLinks, saveLinks, clean, MAX };
