// Colour picker tool: a picked "#rrggbb" written out as HEX, RGB and HSL, and the recent list.
(() => {
  // "#abc" or "#aabbcc" (any case, # optional) -> { r, g, b }, or null
  function parse(hex) {
    let h = String(hex || "").trim().replace(/^#/, "").toLowerCase();
    if (/^[0-9a-f]{3}$/.test(h)) h = [...h].map(c => c + c).join("");
    if (!/^[0-9a-f]{6}$/.test(h)) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4), 16) };
  }

  function hsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    let h = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  // the three ways to copy a colour, or null for something that isn't one
  function formats(hex) {
    const c = parse(hex);
    if (!c) return null;
    const x = hsl(c);
    return {
      hex: "#" + [c.r, c.g, c.b].map(n => n.toString(16).padStart(2, "0")).join(""),
      rgb: `rgb(${c.r}, ${c.g}, ${c.b})`,
      hsl: `hsl(${x.h}, ${x.s}%, ${x.l}%)`,
    };
  }

  // newest first, no repeats, at most `max`; anything that isn't a colour is dropped
  function addRecent(list, hex, max = 8) {
    const f = formats(hex);
    const old = (Array.isArray(list) ? list : []).map(formats).filter(Boolean).map(o => o.hex);
    return [...new Set(f ? [f.hex, ...old] : old)].slice(0, max);
  }

  const api = { parse, hsl, formats, addRecent };
  if (typeof module !== "undefined") module.exports = api;
  else window.Colors = api;
})();
