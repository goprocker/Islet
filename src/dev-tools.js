// Dev panel: git status of the project an agent works in, local dev servers on their ports,
// saved snippets, and decoding what's on the clipboard. Parsing is pure and tested; the few
// functions that run programs take the runner as an argument.
const fs = require("fs");
const path = require("path");

// ---- git ----
// `git status --porcelain=v2 --branch` -> { branch, ahead, behind, files: [{ code, file }] }
function parseGit(text) {
  const out = { branch: "", ahead: 0, behind: 0, files: [] };
  for (const line of String(text || "").split(/\r?\n/)) {
    if (line.startsWith("# branch.head ")) out.branch = line.slice(14);
    else if (line.startsWith("# branch.ab ")) {
      const m = line.match(/\+(\d+) -(\d+)/);
      if (m) { out.ahead = +m[1]; out.behind = +m[2]; }
    } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
      const parts = line.split(" ");
      const xy = parts[1];
      // type 2 (rename) ends with "new<TAB>old"; keep the new name
      const rest = parts.slice(line.startsWith("1 ") ? 8 : 9).join(" ").split("\t")[0];
      out.files.push({ code: xy.replace(/\./g, "").slice(0, 1) || "M", file: rest });
    } else if (line.startsWith("u ")) out.files.push({ code: "U", file: line.split(" ").slice(10).join(" ") });
    else if (line.startsWith("? ")) out.files.push({ code: "?", file: line.slice(2) });
  }
  if (out.branch === "(detached)") out.branch = "detached";
  return out;
}

// ---- ports ----
// Dev servers live on these; system services on other ports aren't shown
const DEV_PORT = p => (p >= 3000 && p <= 9999) || p === 80 || p === 443 || p === 1313 || p === 2368;
// `netstat -ano -p tcp` -> [{ port, pid }] for LISTENING sockets, one per port
function parseNetstat(text) {
  const seen = new Map();
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = line.trim().match(/^TCP\s+\S*?[:.](\d+)\s+\S+\s+LISTENING\s+(\d+)$/i);
    if (!m) continue;
    const port = +m[1], pid = +m[2];
    if (pid > 4 && DEV_PORT(port) && !seen.has(port)) seen.set(port, { port, pid });
  }
  return [...seen.values()].sort((a, b) => a.port - b.port);
}
// Windows services that happen to listen in that range
const SYSTEM_PROCESS = /^(svchost|system|lsass|wininit|services|spoolsv|searchhost|searchindexer|msmpeng|nissrv)\.exe$|^system$/i;
// `tasklist /fo csv /nh` -> Map pid -> image name
function parseTasklist(text) {
  const names = new Map();
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = line.match(/^"([^"]+)","(\d+)"/);
    if (m) names.set(+m[2], m[1]);
  }
  return names;
}

// ---- clipboard decoding ----
const b64url = s => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
const printable = s => s && !/[\u0000-\u0008\u000e-\u001f�]/.test(s);
// -> { kind, title, text } or null when there's nothing useful to say
function decode(input) {
  const s = typeof input === "string" ? input.trim() : "";
  if (!s || s.length > 200000) return null;
  // JWT: three base64url parts, the first two JSON
  const jwt = s.match(/^([A-Za-z0-9_-]{8,})\.([A-Za-z0-9_-]{8,})\.([A-Za-z0-9_-]*)$/);
  if (jwt) {
    try {
      const head = JSON.parse(b64url(jwt[1])), body = JSON.parse(b64url(jwt[2]));
      let note = "";
      if (typeof body.exp === "number") note = `\nexpires ${new Date(body.exp * 1000).toISOString()}${body.exp * 1000 < Date.now() ? " (expired)" : ""}`;
      return { kind: "jwt", title: `JWT · ${head.alg || "?"}`, text: JSON.stringify(body, null, 2) + note };
    } catch {}
  }
  // JSON object or array
  if (/^[[{]/.test(s)) {
    try { return { kind: "json", title: "JSON", text: JSON.stringify(JSON.parse(s), null, 2) }; } catch {}
  }
  // Unix time in seconds or milliseconds (2001..2286)
  if (/^\d{10}(\d{3})?$/.test(s)) {
    const ms = s.length === 13 ? +s : +s * 1000;
    const d = new Date(ms);
    return { kind: "time", title: "Timestamp", text: `${d.toISOString()}\n${d.toLocaleString()}` };
  }
  // ISO date -> Unix time
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !isNaN(Date.parse(s))) {
    const ms = Date.parse(s);
    return { kind: "time", title: "Date", text: `${Math.floor(ms / 1000)}\n${ms}` };
  }
  // base64 that decodes to readable text
  if (s.length >= 8 && s.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(s) && !/^[a-z]+$/i.test(s)) {
    const t = Buffer.from(s, "base64").toString("utf8");
    if (printable(t)) return { kind: "base64", title: "Base64", text: t };
  }
  // URL-encoded
  if (/%[0-9a-f]{2}/i.test(s)) {
    try { const t = decodeURIComponent(s.replace(/\+/g, " ")); if (t !== s) return { kind: "url", title: "URL-decoded", text: t }; } catch {}
  }
  return null;
}

// ---- snippets ----
const MAX_SNIPPETS = 40;
const DEFAULT_SNIPPETS = [
  { name: "Undo last commit, keep changes", text: "git reset --soft HEAD~1" },
  { name: "Safe force push", text: "git push --force-with-lease" },
  { name: "Clean install", text: "rm -rf node_modules && npm ci" },
];
function cleanSnippets(list) {
  if (!Array.isArray(list)) return null;
  return list
    .filter(x => x && typeof x.text === "string" && x.text.trim())
    .map(x => ({ name: String(typeof x.name === "string" && x.name.trim() ? x.name : x.text).slice(0, 80), text: x.text.slice(0, 4000) }))
    .slice(0, MAX_SNIPPETS);
}
function loadSnippets(dir) {
  try { return cleanSnippets(JSON.parse(fs.readFileSync(path.join(dir, "snippets.json"), "utf8"))) || DEFAULT_SNIPPETS; } catch { return DEFAULT_SNIPPETS; }
}
function saveSnippets(dir, list) {
  const clean = cleanSnippets(list) || [];
  try { fs.writeFileSync(path.join(dir, "snippets.json"), JSON.stringify(clean, null, 2)); } catch (e) { console.warn("snippets", e.message); }
  return clean;
}

module.exports = { SYSTEM_PROCESS, parseGit, parseNetstat, parseTasklist, decode, loadSnippets, saveSnippets, cleanSnippets, DEFAULT_SNIPPETS };
