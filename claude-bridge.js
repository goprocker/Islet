// Receives Claude Code hook events (hooks/islet-hook.js) on 127.0.0.1:47321
// and installs/removes those hooks in ~/.claude/settings.json.
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PORT = 47321;
const SETTINGS = path.join(os.homedir(), ".claude", "settings.json");
const HOOK = path.join(__dirname, "hooks", "islet-hook.js");
const EVENTS = ["PermissionRequest", "Notification", "Stop", "UserPromptSubmit", "PostToolUse", "SessionEnd"];
const MARK = "islet-hook.js";

// session id -> { status, at }
const status = new Map();
const pending = new Map(); // request id -> { res, timer }
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

function start({ onStatus, onPermission, onPermissionGone }) {
  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/claude") { res.writeHead(404).end(); return; }
    let body = "";
    req.on("data", d => { body += d; if (body.length > 1e6) req.destroy(); });
    req.on("end", () => {
      let e; try { e = JSON.parse(body); } catch { res.writeHead(400).end(); return; }
      const st = statusFor(e.event, e.message);
      status.set(e.session, { status: st, at: Date.now() });
      onStatus(e.session, st);
      // any new activity in a session answers its open permission card elsewhere
      if (e.event !== "PermissionRequest") {
        for (const [id, p] of pending) if (p.session === e.session) settle(id, null, onPermissionGone);
      }
      if (e.event !== "PermissionRequest") { res.writeHead(200).end("{}"); return; }
      const id = nextId++;
      const timer = setTimeout(() => settle(id, null, onPermissionGone), 24000);
      pending.set(id, { res, timer, session: e.session });
      // hook gave up (Claude Code timed it out or the user answered in the terminal)
      res.on("close", () => { if (pending.has(id) && !res.writableEnded) settle(id, null, onPermissionGone); });
      onPermission({ id, session: e.session, project: path.basename(e.cwd || ""), tool: e.tool, detail: summarize(e.tool, e.toolInput) });
    });
  });
  server.on("error", err => console.warn("claude bridge", err.message));
  server.listen(PORT, "127.0.0.1");
}

function settle(id, decision, onGone) {
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  clearTimeout(p.timer);
  try { p.res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ decision })); } catch {}
  onGone?.(id);
}
const answer = (id, decision, onGone) => settle(id, decision === "allow" || decision === "deny" ? decision : null, onGone);

function summarize(tool, input) {
  if (!input) return "";
  if (input.command) return String(input.description || input.command).slice(0, 140);
  if (input.file_path) return path.basename(input.file_path);
  if (input.url) return input.url;
  if (input.pattern) return input.pattern;
  return "";
}

// ---- settings.json install ----
function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS, "utf8")); } catch { return {}; }
}
function installed() {
  const s = readSettings();
  return EVENTS.every(ev => JSON.stringify(s.hooks?.[ev] || []).includes(MARK));
}
function install() {
  const s = readSettings();
  if (fs.existsSync(SETTINGS)) fs.copyFileSync(SETTINGS, SETTINGS + ".islet-backup");
  s.hooks ||= {};
  for (const ev of EVENTS) {
    const list = (s.hooks[ev] || []).filter(g => !JSON.stringify(g).includes(MARK));
    list.push({
      ...(ev === "PostToolUse" ? { matcher: "*" } : {}),
      hooks: [{ type: "command", command: `node "${HOOK}" ${ev}`, timeout: ev === "PermissionRequest" ? 30 : 5 }],
    });
    s.hooks[ev] = list;
  }
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2));
}
function uninstall() {
  const s = readSettings();
  if (!s.hooks) return;
  for (const ev of Object.keys(s.hooks)) {
    s.hooks[ev] = s.hooks[ev].filter(g => !JSON.stringify(g).includes(MARK));
    if (!s.hooks[ev].length) delete s.hooks[ev];
  }
  if (!Object.keys(s.hooks).length) delete s.hooks;
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2));
}

module.exports = { start, answer, status, install, uninstall, installed };
