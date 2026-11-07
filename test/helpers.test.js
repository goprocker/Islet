const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { spawn } = require("child_process");

const run = args => spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "..", "src", "helpers.ps1"), ...args], { windowsHide: true });
const exited = (p, ms) => new Promise(resolve => {
  const t = setTimeout(() => resolve(false), ms);
  p.on("exit", () => { clearTimeout(t); resolve(true); });
});

test("one process carries tagged media and system lines", { skip: process.platform !== "win32", timeout: 60000 }, async () => {
  const p = run([]);
  let out = "";
  const got = new Promise(resolve => p.stdout.on("data", d => {
    out += d;
    if (/^M \{.*\}\r?$/m.test(out) && /^S \{.*\}\r?$/m.test(out)) resolve();
  }));
  try {
    await got;
    const line = tag => JSON.parse(out.split(/\r?\n/).find(l => l.startsWith(tag)).slice(2));
    assert.ok("active" in line("M "));
    assert.ok("fullscreen" in line("S "));
  } finally { p.kill(); }
});

test("exits when the parent is gone", { skip: process.platform !== "win32", timeout: 60000 }, async () => {
  const parent = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"]);
  const p = run(["-ParentPid", String(parent.pid)]);
  try {
    await new Promise(resolve => p.stdout.once("data", resolve));
    parent.kill();
    assert.ok(await exited(p, 15000), "helpers.ps1 should stop on its own");
  } finally { parent.kill(); p.kill(); }
});
