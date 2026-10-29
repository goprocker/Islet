const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

// point the bridge at a throwaway home folder, so real settings are never touched
function withHome(files, fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "islet-home-"));
  const realHome = os.homedir;
  os.homedir = () => home;
  delete require.cache[require.resolve("../claude-bridge")];
  try {
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(home, rel)), { recursive: true });
      fs.writeFileSync(path.join(home, rel), text);
    }
    return fn(require("../claude-bridge"), rel => fs.readFileSync(path.join(home, rel), "utf8"));
  } finally {
    os.homedir = realHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
}

test("invalid settings.json is left unchanged and install throws", () => {
  withHome({ ".claude/settings.json": "{invalid" }, (bridge, read) => {
    assert.throws(() => bridge.install(), /isn't valid JSON/);
    assert.strictEqual(read(".claude/settings.json"), "{invalid");
  });
});

test("a bad Codex file stops the install before Claude's file is written", () => {
  const claude = JSON.stringify({ model: "x" });
  withHome({ ".claude/settings.json": claude, ".codex/hooks.json": "[1,2]" }, (bridge, read) => {
    assert.throws(() => bridge.install(), /doesn't look like/);
    assert.strictEqual(read(".claude/settings.json"), claude);
    assert.strictEqual(read(".codex/hooks.json"), "[1,2]");
  });
});

test("uninstall leaves an invalid file unchanged", () => {
  withHome({ ".claude/settings.json": "{invalid" }, (bridge, read) => {
    assert.throws(() => bridge.uninstall());
    assert.strictEqual(read(".claude/settings.json"), "{invalid");
  });
});

test("missing settings.json is created, other settings kept when present", () => {
  withHome({}, bridge => { bridge.install(); assert.ok(bridge.installed()); });
  withHome({ ".claude/settings.json": JSON.stringify({ model: "x", hooks: { Stop: [{ hooks: [{ type: "command", command: "other" }] }] } }) }, (bridge, read) => {
    bridge.install();
    const s = JSON.parse(read(".claude/settings.json"));
    assert.strictEqual(s.model, "x");
    assert.ok(JSON.stringify(s.hooks.Stop).includes("other"));
    assert.ok(bridge.installed());
  });
});

test("installed() is false, not an error, for an unreadable file", () => {
  withHome({ ".claude/settings.json": "{invalid" }, bridge => assert.strictEqual(bridge.installed(), false));
});

test("install and uninstall keep other handlers in a group shared with Islet", () => {
  const shared = JSON.stringify({ hooks: { Stop: [{ matcher: "x", hooks: [{ type: "command", command: "node islet-hook.js Stop" }, { type: "command", command: "echo keep-me" }] }] } });
  withHome({ ".claude/settings.json": shared }, (bridge, read) => {
    bridge.install();
    let stop = JSON.parse(read(".claude/settings.json")).hooks.Stop;
    assert.deepStrictEqual(stop[0], { matcher: "x", hooks: [{ type: "command", command: "echo keep-me" }] });
    assert.strictEqual(stop.filter(g => JSON.stringify(g).includes("islet-hook.js")).length, 1);
    bridge.uninstall();
    stop = JSON.parse(read(".claude/settings.json")).hooks.Stop;
    assert.deepStrictEqual(stop, [{ matcher: "x", hooks: [{ type: "command", command: "echo keep-me" }] }]);
  });
});
