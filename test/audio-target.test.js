const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { audioTarget } = require("../audio-target");

test("known players map to their process", () => {
  assert.strictEqual(audioTarget("Spotify.exe"), "Spotify");
  assert.strictEqual(audioTarget("SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify"), "Spotify");
  assert.strictEqual(audioTarget("Chrome"), "chrome");
  assert.strictEqual(audioTarget("MSEdge"), "msedge");
  assert.strictEqual(audioTarget("308046B0AF4A39CB"), "firefox");
  assert.strictEqual(audioTarget("AppleInc.AppleMusicWin_nzyj5cx40ttqa!App"), "AppleMusic");
});

test("a desktop player's exe name is used", () => {
  assert.strictEqual(audioTarget("vlc.exe"), "vlc");
  assert.strictEqual(audioTarget("C:\\Program Files\\Foo\\foo-player.exe"), "foo-player");
});

test("anything unresolved captures nothing", () => {
  for (const source of ["", null, undefined, 7, "Some.Package_abc!App", "bad name.exe\nvol 1"]) assert.strictEqual(audioTarget(source), "");
});

// the real capture code, compiled as the app does, driven over stdin
test("a target with no process gives one flat line, and switching gives another", { skip: process.platform !== "win32", timeout: 60000 }, async () => {
  const script = path.join(__dirname, "..", "spotify-audio.ps1");
  assert.ok(fs.existsSync(script));
  const p = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script], { windowsHide: true });
  let out = "", err = "";
  p.stdout.on("data", d => { out += d; });
  p.stderr.on("data", d => { err += d; });
  const flat = new RegExp(`^${Array(24).fill("0").join(",")}\\r?$`, "gm");
  const flats = () => (out.match(flat) || []).length;
  const until = async n => { for (let i = 0; i < 300 && flats() < n; i++) await new Promise(r => setTimeout(r, 100)); };
  try {
    p.stdin.write("target islet-no-such-process\n");
    await until(1);
    await new Promise(r => setTimeout(r, 1500)); // a line from the starting target may come first
    const settled = flats();
    assert.ok(settled >= 1, `no flat line: ${err}`);
    await new Promise(r => setTimeout(r, 1500));
    assert.strictEqual(flats(), settled, "stays quiet while waiting");
    p.stdin.write("target\n");
    await until(settled + 1);
    assert.strictEqual(flats(), settled + 1, `no flat line after switching: ${err}`);
  } finally { p.kill(); }
});
