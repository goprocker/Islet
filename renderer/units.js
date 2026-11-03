// Unit converter for the Units tool: each kind lists its units as a factor to one base unit
// (temperature is the odd one out and converts through Celsius).
(() => {
  const KINDS = {
    length: { label: "Length", units: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 } },
    weight: { label: "Weight", units: { mg: 0.000001, g: 0.001, kg: 1, t: 1000, oz: 0.028349523125, lb: 0.45359237 } },
    temperature: { label: "Temperature", units: { "°C": "c", "°F": "f", K: "k" } },
    volume: { label: "Volume", units: { ml: 0.001, l: 1, "cup": 0.24, "fl oz": 0.0295735, gal: 3.78541 } },
    speed: { label: "Speed", units: { "m/s": 1, "km/h": 1 / 3.6, mph: 0.44704, knot: 0.514444 } },
    data: { label: "Data", units: { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 } },
    time: { label: "Time", units: { s: 1, min: 60, h: 3600, day: 86400, week: 604800 } },
  };

  const toC = { c: v => v, f: v => (v - 32) * 5 / 9, k: v => v - 273.15 };
  const fromC = { c: v => v, f: v => v * 9 / 5 + 32, k: v => v + 273.15 };

  // convert(value, kind, from, to) -> number, or NaN for an unknown unit or a non-number
  function convert(value, kind, from, to) {
    const k = KINDS[kind], v = Number(value);
    if (!k || !(from in k.units) || !(to in k.units) || value === "" || !Number.isFinite(v)) return NaN;
    if (kind === "temperature") return fromC[k.units[to]](toC[k.units[from]](v));
    return v * k.units[from] / k.units[to];
  }

  // short, readable number: up to 6 significant digits, no trailing zeros
  const show = n => (Number.isFinite(n) ? String(Number(n.toPrecision(6))) : "");

  const api = { KINDS, convert, show };
  if (typeof module !== "undefined") module.exports = api;
  else window.Units = api;
})();
