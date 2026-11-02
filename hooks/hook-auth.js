// Secret shared by Islet and its hook, in the user's own profile folder. Only signatures
// travel over the port, so a program listening there in Islet's place never learns it.
const { execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const file = () => path.join(os.homedir(), ".islet-hook-token");
function readToken() {
  try { return fs.readFileSync(file(), "utf8").trim(); } catch { return ""; }
}
// Windows ignores the file mode, so the secret would rely on whatever the folder grants.
// Give it its own access list: this user only. Once per run; the bridge calls this a lot,
// so a failure is tried again at most once a minute.
const RETRY_MS = 60000;
// a bare name can resolve to the wrong account, for example when the PC has the same name
function account(username = os.userInfo().username, domain = process.env.USERDOMAIN) {
  return domain ? `${domain}\\${username}` : username;
}
let locked = "", failed = { path: "", at: 0 };
function lock() {
  const target = file();
  if (process.platform !== "win32" || locked === target) return;
  if (failed.path === target && Date.now() - failed.at < RETRY_MS) return;
  try {
    execFileSync("icacls", [target, "/inheritance:r", "/remove:g", "*S-1-5-18", "*S-1-5-32-544", "/grant:r", `${account()}:F`], { stdio: "ignore", windowsHide: true });
    locked = target;
  } catch (e) {
    failed = { path: target, at: Date.now() };
    console.warn("couldn't restrict the hook secret", e.message);
  }
}
function ensureToken() {
  const have = readToken();
  if (have) { lock(); return have; }
  const token = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(file(), token, { mode: 0o600 });
  lock();
  return token;
}
const sign = (token, what, nonce) => crypto.createHmac("sha256", token).update(`${what}:${nonce}`).digest("hex");
function verify(token, what, nonce, proof) {
  const want = Buffer.from(sign(token, what, nonce));
  const got = Buffer.from(typeof proof === "string" ? proof : "");
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

module.exports = { readToken, ensureToken, sign, verify, account };
