// Clipboard Actions: turn a copied text into a cleaned or transformed copy.
// available(text) lists the actions that make sense for that text; run(id, text) returns the result,
// or null when the action doesn't apply (bad JSON, not Base64, nothing to change).
const TRACKERS = /^(utm_\w+|fbclid|gclid|gclsrc|dclid|msclkid|mc_cid|mc_eid|igshid|yclid|_hsenc|_hsmi|mkt_tok|ref_src|si|spm|oly_enc_id|oly_anon_id|vero_id|wickedid|__s)$/i;

// words for the case actions: any script's letters, digits and combining marks (\p{M}) count, so Tamil
// or accented text is kept rather than dropped; a lower-to-upper step splits camelCase
const words = t => t.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2").split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean).map(w => w.toLowerCase());
const cap = w => { const [c, ...rest] = w; return c.toUpperCase() + rest.join(""); };
// a case action that would leave nothing (only symbols) is not offered
const joined = (t, f) => { const r = f(words(t)); return r ? r : null; };
const lines = t => t.split(/\r?\n/);
const isUrl = t => /^https?:\/\/\S+$/i.test(t.trim());

function cleanUrl(t) {
  let u;
  try { u = new URL(t.trim()); } catch { return null; }
  for (const k of [...u.searchParams.keys()]) if (TRACKERS.test(k)) u.searchParams.delete(k);
  if (/(^|\.)amazon\./i.test(u.hostname)) { const m = u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/); if (m) { u.pathname = "/dp/" + m[1]; u.search = ""; } }
  let out = u.toString();
  if (!u.search && out.endsWith("?")) out = out.slice(0, -1);
  return out;
}
function b64decode(t) {
  const s = t.trim().replace(/-/g, "+").replace(/_/g, "/");
  if (s.length < 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return null;
  const out = Buffer.from(s, "base64").toString("utf8");
  return /[�\x00-\x08\x0E-\x1F]/.test(out) ? null : out;
}
// numbers keep their exact text: JSON.parse would round 9007199254740993 and turn 1e400 into null,
// so each number is passed back to stringify as its raw source (JSON.rawJSON); without that support
// a number that would not survive the round trip makes the action decline instead of changing it
function json(t, space) {
  try {
    let lossy = false;
    const raw = typeof JSON.rawJSON === "function";
    const v = JSON.parse(t, (k, val, ctx) => {
      if (typeof val !== "number" || !ctx || typeof ctx.source !== "string") return val;
      if (raw) return JSON.rawJSON(ctx.source);
      if (JSON.stringify(val) !== ctx.source) lossy = true;
      return val;
    });
    return lossy ? null : JSON.stringify(v, null, space);
  } catch { return null; }
}

const ACTIONS = [
  { id: "cleanUrl", label: "Clean link", when: isUrl, run: cleanUrl },
  { id: "trim", label: "Tidy spaces", run: t => lines(t).map(l => l.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim() },
  { id: "oneLine", label: "One line", when: t => /\n/.test(t), run: t => t.replace(/\s+/g, " ").trim() },
  { id: "upper", label: "UPPER", when: t => !isUrl(t), run: t => t.toUpperCase() },
  { id: "lower", label: "lower", when: t => !isUrl(t), run: t => t.toLowerCase() },
  { id: "title", label: "Title Case", when: t => !isUrl(t), run: t => t.toLowerCase().replace(/(^|[\s\-(["'])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) },
  { id: "camel", label: "camelCase", when: t => t.length <= 200 && !isUrl(t), run: t => joined(t, ws => ws.map((w, i) => i ? cap(w) : w).join("")) },
  { id: "snake", label: "snake_case", when: t => t.length <= 200 && !isUrl(t), run: t => joined(t, ws => ws.join("_")) },
  { id: "kebab", label: "kebab-case", when: t => t.length <= 200 && !isUrl(t), run: t => joined(t, ws => ws.join("-")) },
  { id: "sortLines", label: "Sort lines", when: t => lines(t).length > 1, run: t => lines(t).sort((a, b) => a.localeCompare(b)).join("\n") },
  { id: "uniqLines", label: "Remove duplicate lines", when: t => lines(t).length > 1, run: t => [...new Set(lines(t))].join("\n") },
  { id: "jsonPretty", label: "Format JSON", when: t => /^\s*[[{]/.test(t), run: t => json(t, 2) },
  { id: "jsonMin", label: "Minify JSON", when: t => /^\s*[[{]/.test(t), run: t => json(t) },
  { id: "urlEncode", label: "URL-encode", run: t => encodeURIComponent(t) },
  { id: "urlDecode", label: "URL-decode", when: t => /%[0-9a-f]{2}/i.test(t), run: t => { try { return decodeURIComponent(t); } catch { return null; } } },
  { id: "b64encode", label: "Base64 encode", run: t => Buffer.from(t, "utf8").toString("base64") },
  { id: "b64decode", label: "Base64 decode", when: t => b64decode(t) !== null, run: b64decode },
];

const available = text => typeof text !== "string" || !text ? [] :
  ACTIONS.filter(a => (!a.when || a.when(text)) && (() => { const r = a.run(text); return r !== null && r !== text; })()).map(({ id, label }) => ({ id, label }));
function run(id, text) {
  const a = ACTIONS.find(x => x.id === id);
  if (!a || typeof text !== "string" || (a.when && !a.when(text))) return null;
  const r = a.run(text);
  return r === null || r === text ? null : r;
}

module.exports = { available, run, cleanUrl };
