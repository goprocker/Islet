const test = require("node:test");
const assert = require("node:assert");
const { idOf, current, clock, obsAuth, obsClient } = require("../src/recording");

test("rec: capture ids name the app", () => {
  assert.strictEqual(idOf("Microsoft.ScreenSketch_8wekyb3d8bbwe"), "screensketch");
  assert.strictEqual(idOf("C:#Program Files#obs-studio#bin#64bit#obs64.exe"), "obs64");
  assert.strictEqual(idOf("MSTeams_8wekyb3d8bbwe"), "msteams");
});

test("rec: a recorder beats a share, unknown apps capture", () => {
  const cap = [{ app: "C:#Program Files#Google#Chrome#Application#chrome.exe", start: 5 }, { app: "Microsoft.ScreenSketch_8wekyb3d8bbwe", start: 9 }];
  const r = current(cap, undefined, 100);
  assert.deepStrictEqual([r.name, r.mode, r.start, r.proc], ["Snipping Tool", "rec", 9, "SnippingTool"]);
  assert.strictEqual(current(cap.slice(0, 1), undefined, 100).mode, "share");
  assert.strictEqual(current([{ app: "C:#x#foo.exe", start: 0 }], undefined, 100).start, 100); // no start: from now
  assert.strictEqual(current([{ app: "C:#x#foo.exe" }], undefined).mode, "capture");
  assert.strictEqual(current([], undefined), null);
  assert.strictEqual(current(null, undefined), null);
});

test("rec: OBS's preview is capturing; only OBS itself says recording", () => {
  const cap = [{ app: "C:#Program Files#obs-studio#bin#64bit#obs64.exe", start: 1 }];
  assert.strictEqual(current(cap, undefined, 10).mode, "capture"); // not connected
  assert.strictEqual(current(cap, null, 10), null); // connected, not recording
  const r = current(cap, { active: true, paused: true, duration: 4000 }, 10000);
  assert.deepStrictEqual([r.mode, r.paused, r.start, r.obs], ["rec", true, 6000, true]);
});

test("rec: clock", () => {
  assert.strictEqual(clock(0), "0:00");
  assert.strictEqual(clock(75000), "1:15");
  assert.strictEqual(clock(3725000), "1:02:05");
  assert.strictEqual(clock(-5), "0:00");
});

test("obs: authentication matches the protocol's example", () => {
  assert.strictEqual(obsAuth("supersecretpassword", "lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI=", "+IxH4CnCiqpX1rM9scsNynZzbOe4KhDeYcTNS3PDaeY="),
    "1Ct943GAT+6YQUUX47Ia/ncufilbe6+oD6lY+5kaCu4=");
});

test("obs: identifies, reports recording, controls, and goes quiet when OBS closes", () => {
  const sockets = [];
  class FakeWS {
    constructor(url) { this.url = url; this.sent = []; this.readyState = 1; sockets.push(this); }
    send(m) { this.sent.push(JSON.parse(m)); }
    close() { this.onclose?.(); }
    msg(o) { this.onmessage({ data: JSON.stringify(o) }); }
  }
  const states = [], timers = [];
  const c = obsClient(() => ({ server_enabled: true, server_port: 4456, server_password: "pw" }), s => states.push(s),
    { WS: FakeWS, setTimer: (f, ms) => { timers.push(ms); return 1; }, clearTimer: () => {}, every: 1e9 });
  const ws = sockets[0];
  assert.strictEqual(ws.url, "ws://127.0.0.1:4456");
  ws.msg({ op: 0, d: { authentication: { salt: "s", challenge: "c" } } });
  assert.deepStrictEqual(ws.sent[0], { op: 1, d: { rpcVersion: 1, eventSubscriptions: 64, authentication: obsAuth("pw", "s", "c") } });
  ws.msg({ op: 2, d: {} });
  assert.strictEqual(ws.sent[1].d.requestType, "GetRecordStatus");
  ws.msg({ op: 7, d: { requestType: "GetRecordStatus", requestStatus: { result: true }, responseData: { outputActive: true, outputPaused: false, outputDuration: 1500 } } });
  ws.msg({ op: 7, d: { requestType: "GetRecordStatus", requestStatus: { result: true }, responseData: { outputActive: true, outputPaused: false, outputDuration: 1500 } } });
  assert.deepStrictEqual(states, [null, { active: true, paused: false, duration: 1500 }]); // repeats are not re-sent
  assert.deepStrictEqual({ ...c.snapshot(), at: 0 }, { connected: true, state: { active: true, paused: false, duration: 1500 }, at: 0 });
  assert.strictEqual(c.control("stop"), true);
  assert.strictEqual(ws.sent.at(-1).d.requestType, "StopRecord");
  assert.strictEqual(c.control("explode"), false);
  ws.close();
  assert.strictEqual(states.at(-1), undefined); // disconnected, not "connected and idle" (#231)
  assert.strictEqual(c.snapshot().connected, false);
  assert.strictEqual(current([{ app: "C:#obs64.exe", start: 100 }], states.at(-1), 2000).id.startsWith("obs"), true);
  assert.strictEqual(timers.at(-1), 10000);
  c.stop();
});

test("obs: a switched-off server is never dialled", () => {
  let made = 0;
  const timers = [];
  const c = obsClient(() => ({ server_enabled: false }), () => {}, { WS: class { constructor() { made++; } }, setTimer: (f, ms) => timers.push(ms), clearTimer: () => {} });
  assert.strictEqual(made, 0);
  assert.deepStrictEqual(timers, [30000]);
  c.stop();
});
