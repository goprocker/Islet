// Quick Settings panel: which tiles exist and how a reading becomes tile state.
// A tile is {id, label, kind: "radio"|"settings"|"captions", ...}; the panel also has volume and brightness sliders.
const TILES = [
  { id: "wifi", label: "Wi-Fi", kind: "radio" },
  { id: "bluetooth", label: "Bluetooth", kind: "radio" },
  { id: "airplane", label: "Airplane mode", kind: "radio" },
  { id: "accessibility", label: "Accessibility", kind: "settings", uri: "ms-settings:easeofaccess" },
  { id: "saver", label: "Energy saver", kind: "settings", uri: "ms-settings:batterysaver" },
  { id: "captions", label: "Live captions", kind: "captions" },
];

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = v => (typeof v === "number" && Number.isFinite(v) ? v : null);

// radios: {wifi: "On", bluetooth: "Off", airplane: false} from radios.ps1 (a missing radio is absent);
// levels: {vol, mute, bright} from quickset.ps1. Either may be null when its script failed.
function state(radios, levels) {
  const r = radios && typeof radios === "object" ? radios : {};
  const l = levels && typeof levels === "object" ? levels : {};
  const vol = num(l.vol), bright = num(l.bright);
  return {
    wifi: r.wifi === undefined ? null : r.wifi === "On",
    bluetooth: r.bluetooth === undefined ? null : r.bluetooth === "On",
    airplane: typeof r.airplane === "boolean" ? r.airplane : null,
    vol: vol === null ? null : clamp(vol, 0, 1),
    mute: !!l.mute,
    bright: bright === null ? null : clamp(bright, 0, 100),
  };
}

// what the panel may ask main to do; anything else is dropped. Returns a normalised action or null.
function action(kind, value) {
  if (kind === "wifi" || kind === "bluetooth" || kind === "captions") return { kind };
  if (kind === "airplane" || kind === "mute") return { kind, on: !!value };
  if (kind === "vol") { const v = num(value); return v === null ? null : { kind, value: clamp(v, 0, 1) }; }
  if (kind === "bright") { const v = num(value); return v === null ? null : { kind, value: Math.round(clamp(v, 0, 100)) }; }
  const tile = TILES.find(t => t.id === kind && t.kind === "settings");
  return tile ? { kind, uri: tile.uri } : null;
}

module.exports = { TILES, state, action };
