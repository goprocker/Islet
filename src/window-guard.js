// Keeps every Islet window on its own local page. A window that navigated to a web page,
// or opened a new one, would hand that page the full preload bridge (shelf, settings,
// permission answers), so both are refused. Links meant for the browser go through
// shell.openExternal in main instead.
const { pathToFileURL } = require("url");

// same file (any #section of it) is fine; anything else is not
function allowed(target, page) {
  try {
    const t = new URL(target), p = new URL(page);
    return t.protocol === "file:" && t.pathname.toLowerCase() === p.pathname.toLowerCase();
  } catch { return false; }
}

function guard(win, file) {
  const page = pathToFileURL(file).href;
  const wc = win.webContents;
  const block = (e, url) => { if (!allowed(url, page)) { e.preventDefault(); console.warn("blocked navigation", String(url).slice(0, 200)); } };
  wc.on("will-navigate", block);
  wc.on("will-redirect", block);
  wc.setWindowOpenHandler(() => ({ action: "deny" }));
  return win;
}

module.exports = { guard, allowed };
