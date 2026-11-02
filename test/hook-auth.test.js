const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const authPath = require.resolve("../hooks/hook-auth");
const windows = { skip: process.platform !== "win32" };

// a fresh copy of the module, with its secret in a throwaway home folder
function withAuth(fn, { icacls } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "islet-auth-"));
  const saved = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME, USERDOMAIN: process.env.USERDOMAIN };
  const realExec = childProcess.execFileSync, realWarn = console.warn, realNow = Date.now;
  process.env.USERPROFILE = process.env.HOME = home;
  if (icacls) childProcess.execFileSync = icacls;
  console.warn = () => {};
  delete require.cache[authPath];
  try { return fn(require(authPath), home); } finally {
    childProcess.execFileSync = realExec; console.warn = realWarn; Date.now = realNow;
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    delete require.cache[authPath];
    fs.rmSync(home, { recursive: true, force: true });
  }
}

test("the account is qualified with its domain", () => {
  withAuth(auth => {
    assert.strictEqual(auth.account("gopin", "GOPIN"), "GOPIN\\gopin"); // same PC and user name
    assert.strictEqual(auth.account("sam", "CORP"), "CORP\\sam");
    assert.strictEqual(auth.account("Sam Lee", "CORP"), "CORP\\Sam Lee");
  });
});

test("no domain leaves the bare name, never undefined", () => {
  withAuth(auth => {
    delete process.env.USERDOMAIN;
    assert.strictEqual(auth.account("sam"), "sam");
    assert.strictEqual(auth.account("sam", ""), "sam");
  });
});

test("the name reaches icacls as one argument", windows, () => {
  const calls = [];
  withAuth(auth => {
    process.env.USERDOMAIN = "CORP";
    auth.ensureToken();
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].at(-1), `CORP\\${os.userInfo().username}:F`);
  }, { icacls: (_, args) => { calls.push(args); } });
});

test("a successful lock isn't repeated", windows, () => {
  let calls = 0;
  withAuth(auth => {
    auth.ensureToken(); auth.ensureToken(); auth.ensureToken();
    assert.strictEqual(calls, 1);
  }, { icacls: () => { calls++; } });
});

test("a failed lock retries after a wait, then stays locked", windows, () => {
  let calls = 0, fail = true;
  withAuth(auth => {
    let now = 1000;
    Date.now = () => now;
    auth.ensureToken();
    assert.strictEqual(calls, 1);
    auth.ensureToken();
    assert.strictEqual(calls, 1, "no retry straight away");
    now += 60000; fail = false;
    auth.ensureToken();
    assert.strictEqual(calls, 2, "tried again");
    now += 60000;
    auth.ensureToken();
    assert.strictEqual(calls, 2, "locked now");
  }, { icacls: () => { calls++; if (fail) throw new Error("denied"); } });
});

test("a real icacls leaves a throwaway secret usable by this user only", windows, () => {
  withAuth((auth, home) => {
    const token = auth.ensureToken();
    const file = path.join(home, ".islet-hook-token");
    assert.strictEqual(fs.readFileSync(file, "utf8"), token);
    fs.writeFileSync(file, token);
    const acl = childProcess.execFileSync("icacls", [file], { encoding: "utf8", windowsHide: true }).replace(file, "");
    assert.ok(acl.toLowerCase().includes(`${os.userInfo().username}:(f)`.toLowerCase()), acl);
    assert.ok(!/SYSTEM|Administrators|Users|\(I\)/.test(acl), acl);
  });
});
