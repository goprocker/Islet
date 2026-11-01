// config.json can be edited by hand. Known settings with the wrong type or an impossible
// value fall back to their default, so nothing later trips over them; unknown keys stay.
const bool = v => typeof v === "boolean";
const text = v => typeof v === "string";
const clock = v => text(v) && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const time = v => v === "" || clock(v);
const number = v => typeof v === "number" && Number.isFinite(v);
const CHECKS = {
  spotifyClientId: text, calendarIcsUrl: text, weatherCity: text, downloadsFolder: text,
  displayId: v => v === null || number(v),
  notifications: bool, hideInFullscreen: bool, lyrics: bool, dnd: bool, clipboardHistory: bool,
  idleHide: bool, hideWindowsBanners: bool, powerAnim: bool,
  permissionWaitSeconds: v => number(v) && v >= 0 && v <= 24,
  dndFrom: time, dndTo: time, dndSkipUntil: number,
  weatherUnit: v => v === "C" || v === "F",
  size: v => ["compact", "normal", "large"].includes(v),
  accent: v => v === "album" || (text(v) && /^#[0-9a-f]{6}$/i.test(v)),
  powerAnimStyle: v => v === "cinematic" || v === "subtle",
};

// returns the settings to use and the names of the fields that were rejected
function checkConfig(saved, defaults) {
  const config = { ...defaults, ...saved }, invalid = [];
  for (const [key, ok] of Object.entries(CHECKS)) {
    if (key in saved && !ok(saved[key])) { config[key] = defaults[key]; invalid.push(key); }
  }
  return { config, invalid };
}

module.exports = { checkConfig, clock };
