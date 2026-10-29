// Receives Claude Code and Codex hook events (hooks/islet-hook.js) on 127.0.0.1:47321
// and installs/removes those hooks in ~/.claude/settings.json and ~/.codex/hooks.json.
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PORT = 47321;
const SETTINGS = path.join(os.homedir(), ".claude", "settings.json");
const HOOK = path.join(__dirname, "hooks", "islet-hook.js");
const EVENTS = ["PermissionRequest", "Notification", "Stop", "UserPromptSubmit", "PostToolUse", "SessionEnd"];
const MARK = "islet-hook.js";
const CODEX_DIR = path.join(os.homedir(), ".codex");
const CODEX_HOOKS = path.join(CODEX_DIR, "hooks.json");
const CODEX_EVENTS = ["SessionStart", "UserPromptSubmit", "PermissionRequest", "PostToolUse", "Stop", "SessionEnd"];

// session id -> { status, at }
const status = new Map();
const pending = new Map(); // request id -> { res, timer }
// Codex has no transcript Islet reads, so its sessions are kept from the hooks:
// session id -> { cwd, status, at, actions: [{ tool, toolInput, text, time }] } (newest first)
const codex = new Map();
function trackCodex(e, st) {
  const s = codex.get(e.session) || { cwd: "", actions: [] };
  s.cwd = e.cwd || s.cwd;
  s.status = st;
  s.at = Date.now();
  const add = a => { s.actions.unshift({ ...a, time: Date.now() }); s.actions.length = Math.min(s.actions.length, 3); };
  if (e.event === "UserPromptSubmit" && e.prompt) add({ text: `You: ${e.prompt}` });
  if (e.event === "PostToolUse" && e.tool) add({ tool: e.tool, toolInput: e.toolInput });
  if (e.event === "Stop" && e.lastMessage) add({ text: e.lastMessage });
  if (st === "ended") codex.delete(e.session); else codex.set(e.session, s);
}
let nextId = 1;

function statusFor(event, message) {
  switch (event) {
    case "PermissionRequest": return "waiting";
    // idle "waiting for your input" counts as done; permission notices as waiting
    case "Notification": return /permission/i.test(message) ? "waiting" : "done";
    case "Stop": return "done";
    case "SessionEnd": return "ended";
    default: return "working";
  }
}

let waitMs = () => 8000;
function start({ onStatus, onPermission, onPermissionGone, permissionWait }) {
  if (permissionWait) waitMs = permissionWait;
  // a request answered anywhere (notch, terminal, timeout) means Claude is working again
  const gone = id => {
    const p = pending.get(id);
    if (p && status.get(p.session)?.status === "waiting") { status.set(p.session, { status: "working", at: Date.now() }); onStatus(p.session, "working"); }
    onPermissionGone(id);
  };
  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/claude") { res.writeHead(404).end(); return; }
    let body = "";
    req.on("data", d => { body += d; if (body.length > 1e6) req.destroy(); });
    req.on("end", () => {
      let e; try { e = JSON.parse(body); } catch { res.writeHead(400).end(); return; }
      const st = statusFor(e.event, e.message);
      status.set(e.session, { status: st, at: Date.now() });
      if (e.agent === "codex") trackCodex(e, st);
      onStatus(e.session, st);
      // any new activity in a session answers its open permission card elsewhere
      if (e.event !== "PermissionRequest") {
        for (const [id, p] of pending) if (p.session === e.session) settle(id, null, gone);
      }
      // Codex shows "needs you" but is answered in its own terminal
      if (e.event !== "PermissionRequest" || e.agent === "codex") { res.writeHead(200).end("{}"); return; }
      const id = nextId++;
      // Claude Code holds its terminal prompt while we wait, so keep this short
      const ms = Math.min(Math.max(waitMs(), 0), 24000);
      if (!ms) { res.writeHead(200).end("{}"); return; }
      const timer = setTimeout(() => settle(id, null, gone), ms);
      pending.set(id, { res, timer, session: e.session });
      // hook gave up (Claude Code timed it out or the user answered in the terminal)
      res.on("close", () => { if (pending.has(id) && !res.writableEnded) settle(id, null, gone); });
      onPermission({ id, session: e.session, project: path.basename(e.cwd || ""), tool: e.tool, detail: summarize(e.tool, e.toolInput) });
    });
  });
  server.on("error", err => console.warn("claude bridge", err.message));
  server.listen(PORT, "127.0.0.1");
}

function settle(id, decision, onGone) {
  const p = pending.get(id);
  if (!p) return;
  onGone?.(id); // before delete, so it can still see the session
  pending.delete(id);
  clearTimeout(p.timer);
  try { p.res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ decision })); } catch {}
}
function answer(id, decision, onGone) {
  const p = pending.get(id);
  if (p) status.set(p.session, { status: "working", at: Date.now() });
  settle(id, decision === "allow" || decision === "deny" ? decision : null, onGone);
}

function summarize(tool, input) {
  if (!input) return "";
  if (input.command) return String(input.description || input.command).slice(0, 140);
  if (input.file_path) return path.basename(input.file_path);
  if (input.url) return input.url;
  if (input.pattern) return input.pattern;
  return "";
}

// ---- hook install: ~/.claude/settings.json and, when Codex is set up, ~/.codex/hooks.json ----
// A missing file is an empty config. A file that can't be read or isn't a JSON object
// throws, so install/uninstall never replace it with only Islet's hooks.
function readJson(file) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch (e) {
    if (e.code === "ENOENT") return {};
    throw new Error(`Couldn't read ${file} (${e.code || e.message}). Islet left it unchanged.`);
  }
  let s;
  try { s = JSON.parse(text); } catch (e) {
    throw new Error(`${file} isn't valid JSON (${e.message}). Fix it and try again; Islet left it unchanged.`);
  }
  const lists = s?.hooks === undefined || (s.hooks && typeof s.hooks === "object" && !Array.isArray(s.hooks) && Object.values(s.hooks).every(Array.isArray));
  if (!s || typeof s !== "object" || Array.isArray(s) || !lists) throw new Error(`${file} doesn't look like a hooks settings file. Islet left it unchanged.`);
  return s;
}
const targets = () => [
  { file: SETTINGS, events: EVENTS, arg: "" },
  ...(fs.existsSync(CODEX_DIR) ? [{ file: CODEX_HOOKS, events: CODEX_EVENTS, arg: " codex" }] : []),
];
function hasHooks(t) {
  let s;
  try { s = readJson(t.file); } catch { return false; }
  return t.events.every(ev => JSON.stringify(s.hooks?.[ev] || []).includes(MARK));
}
function installed() { return hasHooks(targets()[0]); }
function install() {
  // read and check every file before writing any, so a bad one stops the whole install
  for (const { t, s } of targets().map(t => ({ t, s: readJson(t.file) }))) {
    if (fs.existsSync(t.file)) fs.copyFileSync(t.file, t.file + ".islet-backup");
    s.hooks ||= {};
    fs.mkdirSync(path.dirname(t.file), { recursive: true }); // ~/.claude may not exist yet
    for (const ev of t.events) {
      const list = (s.hooks[ev] || []).filter(g => !JSON.stringify(g).includes(MARK));
      list.push({
        ...(ev === "PostToolUse" ? { matcher: "*" } : {}),
        hooks: [{ type: "command", command: `node "${HOOK}" ${ev}${t.arg}`, timeout: ev === "PermissionRequest" && !t.arg ? 30 : 5 }],
      });
      s.hooks[ev] = list;
    }
    fs.writeFileSync(t.file, JSON.stringify(s, null, 2));
  }
}
function uninstall() {
  for (const { t, s } of targets().map(t => ({ t, s: readJson(t.file) }))) {
    if (!s.hooks) continue;
    for (const ev of Object.keys(s.hooks)) {
      s.hooks[ev] = s.hooks[ev].filter(g => !JSON.stringify(g).includes(MARK));
      if (!s.hooks[ev].length) delete s.hooks[ev];
    }
    if (!Object.keys(s.hooks).length) delete s.hooks;
    fs.writeFileSync(t.file, JSON.stringify(s, null, 2));
  }
}

module.exports = { start, answer, status, codex, install, uninstall, installed };
