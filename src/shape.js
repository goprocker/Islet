// The notch window is only "there" where the notch is drawn: win.setShape() cuts it to one rectangle,
// so clicks and drags outside it reach the apps below, and a file dragged onto the notch lands at once.
// r: the notch's box in page pixels; zoom: the page zoom (size setting); win: the window's size.
// No margin: any strip around the pill would swallow clicks meant for the app below (browser tabs sit
// right there). An empty list would make the window whole again, so a hidden notch keeps 1x1 instead.
const MARGIN = 0;
function shapeRect(r, zoom, win) {
  const ok = n => Number.isFinite(n) && n >= 0;
  if (!r || ![r.x, r.width, r.height].every(ok) || !(zoom > 0)) return null;
  if (r.width < 1 || r.height < 1) return { x: Math.floor(win.width / 2), y: 0, width: 1, height: 1 };
  const x = Math.max(0, Math.floor((r.x - MARGIN) * zoom));
  const right = Math.min(win.width, Math.ceil((r.x + r.width + MARGIN) * zoom));
  const height = Math.min(win.height, Math.ceil((r.height + MARGIN) * zoom));
  return { x, y: 0, width: Math.max(1, right - x), height: Math.max(1, height) };
}
const sameRect = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

module.exports = { shapeRect, sameRect, MARGIN };
