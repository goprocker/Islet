// New releases of Claude Code and Codex, announced as a toast. The npm registry is asked for each
// CLI's latest version every few hours (only the package name is sent); the last version seen is
// kept in userData, so a toast appears once per release and never on the first check.
const fs = require("fs");
const os = require("os");
const path = require("path");

const EVERY_MS = 6 * 3600000;
const FIRST_MS = 45000;
const AGENTS = {
  claude: { name: "Claude Code", pkg: "@anthropic-ai/claude-code", dir: ".claude", update: "claude update" },
  codex: { name: "Codex", pkg: "@openai/codex", dir: ".codex", update: "npm i -g @openai/codex" },
};
let timer = null, first = null, generation = 0; // each start() call begins a new generation

// registry reply -> "1.2.3", or null when it isn't a plain release version
function parseVersion(json) {
  const v = typeof json?.version === "string" ? json.version.trim() : "";
  return /^\d+\.\d+\.\d+$/.test(v) ? v : null;
}

// > 0 when a is the newer version
function compare(a, b) {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

// what to do with a version just fetched: { seen } is what to keep, { announce } says whether to toast.
// With nothing seen yet it only records, so installing Islet doesn't announce an old release.
function decide(seen, latest) {
  if (!latest) return { seen, announce: false };
  if (!seen) return { seen: latest, announce: false };
  return compare(latest, seen) > 0 ? { seen: latest, announce: true } : { seen, announce: false };
}

function load(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch { return {}; }
}

// the agents this person actually uses: the ones with a config folder in their home
const installed = (home = os.homedir()) => Object.keys(AGENTS).filter(id => fs.existsSync(path.join(home, AGENTS[id].dir)));

async function latest(pkg) {
  const r = await fetch(`https://registry.npmjs.org/${pkg}/latest`, { signal: AbortSignal.timeout(15000) });
  return r.ok ? parseVersion(await r.json()) : null;
}

async function check(file, ids, onUpdate, gen) {
  const state = load(file);
  for (const id of ids) {
    let v = null;
    try { v = await latest(AGENTS[id].pkg); } catch { /* offline: try again next time */ }
    if (gen !== generation) return; // stopped or restarted while waiting
    const d = decide(typeof state[id] === "string" ? state[id] : "", v);
    state[id] = d.seen;
    if (d.announce) onUpdate({ id, name: AGENTS[id].name, version: d.seen, update: AGENTS[id].update });
  }
  try { fs.writeFileSync(file, JSON.stringify(state)); } catch (e) { console.warn("agent-updates save", e.message); }
}

function start(dir, onUpdate, ids = installed()) {
  stop();
  if (!ids.length) return;
  const gen = generation, file = path.join(dir, "agent-updates.json");
  const run = () => check(file, ids, onUpdate, gen).catch(e => console.warn("agent-updates", e.message));
  first = setTimeout(run, FIRST_MS);
  timer = setInterval(run, EVERY_MS);
}

function stop() {
  generation++;
  clearTimeout(first);
  clearInterval(timer);
}

module.exports = { AGENTS, parseVersion, compare, decide, installed, start, stop };
