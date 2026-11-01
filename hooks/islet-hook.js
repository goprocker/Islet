#!/usr/bin/env node
// Claude Code / Codex hook -> Islet (local only, 127.0.0.1:47321).
//   node islet-hook.js <EventName> [codex]   (hook input JSON arrives on stdin)
// PermissionRequest waits up to 25 s for Allow/Deny from the notch; with no answer,
// or when Islet isn't running, it prints nothing and Claude Code asks in the terminal.
// The port can be taken by another program, so the listener has to prove it knows the
// per-user secret (hook-auth.js) before it gets any data, and sign any decision it gives.
const http = require("http");
const crypto = require("crypto");
const auth = require("./hook-auth");

const PORT = 47321;
const event = process.argv[2] || "Unknown";
const agent = process.argv[3] === "codex" ? "codex" : "claude";
// only Claude Code waits for Allow / Deny from the notch
const WAIT = event === "PermissionRequest" && agent === "claude" ? 25000 : 1500;

let raw = "";
process.stdin.setEncoding("utf8"); // a character split across chunks stays whole
process.stdin.on("data", d => (raw += d));
process.stdin.on("end", () => {
  let input = {};
  try { input = JSON.parse(raw); } catch {}
  const token = auth.readToken();
  if (!token) return process.exit(0); // Islet hasn't run since this was added
  const nonce = crypto.randomBytes(16).toString("hex");
  const hello = http.request({ host: "127.0.0.1", port: PORT, path: `/hello?nonce=${nonce}`, method: "GET", timeout: 1500 }, res => {
    let out = "";
    res.on("data", d => (out += d));
    res.on("end", () => {
      let r = {};
      try { r = JSON.parse(out); } catch {}
      if (!auth.verify(token, "hello", nonce, r.proof)) return process.exit(0);
      post(input, token, nonce);
    });
  });
  hello.on("timeout", () => { hello.destroy(); process.exit(0); });
  hello.on("error", () => process.exit(0));
  hello.end();
});

function post(input, token, nonce) {
  const body = JSON.stringify({
    event,
    agent,
    nonce,
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
    { host: "127.0.0.1", port: PORT, path: "/claude", method: "POST", timeout: WAIT, headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "X-Islet-Proof": auth.sign(token, "event", body) } },
    res => {
      let out = "";
      res.on("data", d => (out += d));
      res.on("end", () => {
        if (event !== "PermissionRequest" || agent !== "claude") return process.exit(0);
        let r = {};
        try { r = JSON.parse(out); } catch {}
        if ((r.decision === "allow" || r.decision === "deny") && auth.verify(token, r.decision, nonce, r.proof)) {
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
}
