// Screen recording indicator (#224): what is recording or sharing the screen, for how long, and
// what Islet can do about it. Two sources:
//   - Windows' screen-capture records (system.ps1 "capture"): any app using Windows Graphics
//     Capture (Snipping Tool, OBS window/display capture, browsers sharing a tab, Teams...)
//   - OBS through its own WebSocket server (Tools > WebSocket Server Settings), when it is on:
//     also catches game capture, and gives Stop and Pause.
const crypto = require("crypto");

const { idOf, describe, current, clock } = require("../renderer/rec");

// ---- OBS WebSocket v5 ----
// authentication = base64(sha256(base64(sha256(password + salt)) + challenge))
function obsAuth(password, salt, challenge) {
  const secret = crypto.createHash("sha256").update(password + salt).digest("base64");
  return crypto.createHash("sha256").update(secret + challenge).digest("base64");
}

// keeps a connection to OBS while its server is on; onState(state, connected): state is
// { active, paused, duration }, null (connected, not recording) or undefined (not connected, #231)
// readConfig() -> { server_enabled, server_port, server_password, auth_required } or null
function obsClient(readConfig, onState, { WS = globalThis.WebSocket, setTimer = setTimeout, clearTimer = clearTimeout, every = 2000 } = {}) {
  let ws = null, timer = null, poll = null, stopped = false, seq = 0, last = "x", now = undefined, at = 0;
  const report = s => { now = s; at = Date.now(); const k = JSON.stringify(s === undefined ? "off" : s); if (k !== last) { last = k; onState(s, s !== undefined); } };
  const send = (op, d) => { try { ws?.readyState === 1 && ws.send(JSON.stringify({ op, d })); } catch {} };
  const request = type => send(6, { requestType: type, requestId: `islet-${++seq}` });
  const retry = ms => { clearTimer(timer); if (!stopped) timer = setTimer(connect, ms); };
  function connect() {
    const cfg = readConfig();
    if (!cfg?.server_enabled || !WS) return retry(30000); // OBS's server is off: look again later
    const port = Number.isInteger(cfg.server_port) ? cfg.server_port : 4455;
    try { ws = new WS(`ws://127.0.0.1:${port}`); } catch { return retry(10000); }
    ws.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.op === 0) { // Hello
        const a = m.d?.authentication;
        send(1, { rpcVersion: 1, eventSubscriptions: 64, ...(a ? { authentication: obsAuth(String(cfg.server_password || ""), a.salt, a.challenge) } : {}) });
      } else if (m.op === 2) { // Identified
        report(null); // connected, recording unknown until the first reply
        request("GetRecordStatus");
        clearInterval(poll); poll = setInterval(() => request("GetRecordStatus"), every);
      } else if (m.op === 7 && m.d?.requestType === "GetRecordStatus" && m.d.requestStatus?.result) {
        const r = m.d.responseData || {};
        report(r.outputActive ? { active: true, paused: !!r.outputPaused, duration: Number(r.outputDuration) || 0 } : null);
      } else if (m.op === 5 && m.d?.eventType === "RecordStateChanged") request("GetRecordStatus");
    };
    ws.onclose = () => { clearInterval(poll); ws = null; report(undefined); retry(10000); }; // OBS closed, or a wrong password
    ws.onerror = () => {};
  }
  connect();
  return {
    control: action => { const t = { stop: "StopRecord", pause: "PauseRecord", resume: "ResumeRecord" }[action]; if (t && ws) { request(t); return true; } return false; },
    connected: () => ws?.readyState === 1,
    // what a freshly loaded renderer needs (#232); duration is as of `at`
    snapshot: () => ({ connected: now !== undefined, state: now ?? null, at }),
    stop: () => { stopped = true; clearTimer(timer); clearInterval(poll); try { ws?.close(); } catch {} },
  };
}

module.exports = { idOf, describe, current, clock, obsAuth, obsClient };
