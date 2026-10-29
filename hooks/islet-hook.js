#!/usr/bin/env node
// Claude Code / Codex hook -> Islet (local only, 127.0.0.1:47321).
//   node islet-hook.js <EventName> [codex]   (hook input JSON arrives on stdin)
// PermissionRequest waits up to 25 s for Allow/Deny from the notch; with no answer,
// or when Islet isn't running, it prints nothing and Claude Code asks in the terminal.
const http = require("http");

const PORT = 47321;
const event = process.argv[2] || "Unknown";
const agent = process.argv[3] === "codex" ? "codex" : "claude";
// only Claude Code waits for Allow / Deny from the notch
const WAIT = event === "PermissionRequest" && agent === "claude" ? 25000 : 1500;

let raw = "";
process.stdin.on("data", d => (raw += d));
process.stdin.on("end", () => {
  let input = {};
  try { input = JSON.parse(raw); } catch {}
  const body = JSON.stringify({
    event,
    agent,
    session: input.session_id || "",
    cwd: input.cwd || "",
    transcript: input.transcript_path || "",
    message: input.message || "",
    tool: input.tool_name || "",
    toolInput: input.tool_input || null,
    prompt: typeof input.prompt === "string" ? input.prompt.slice(0, 300) : "",
    lastMessage: typeof input.last_assistant_message === "string" ? input.last_assistant_message.slice(0, 300) : "",
  });
  const req = http.request(
    { host: "127.0.0.1", port: PORT, path: "/claude", method: "POST", timeout: WAIT, headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
    res => {
      let out = "";
      res.on("data", d => (out += d));
      res.on("end", () => {
        if (event !== "PermissionRequest" || agent !== "claude") return process.exit(0);
        let r = {};
        try { r = JSON.parse(out); } catch {}
        if (r.decision === "allow" || r.decision === "deny") {
          const decision = r.decision === "allow" ? { behavior: "allow" } : { behavior: "deny", message: "Denied from Islet." };
          process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PermissionRequest", decision } }));
        }
        process.exit(0);
      });
    }
  );
  req.on("timeout", () => { req.destroy(); process.exit(0); });
  req.on("error", () => process.exit(0));
  req.end(body);
});
