// Secret shared by Islet and its hook, in the user's own profile folder. Only signatures
// travel over the port, so a program listening there in Islet's place never learns it.
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const file = () => path.join(os.homedir(), ".islet-hook-token");
function readToken() {
  try { return fs.readFileSync(file(), "utf8").trim(); } catch { return ""; }
}
function ensureToken() {
  const have = readToken();
  if (have) return have;
  const token = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(file(), token, { mode: 0o600 });
  return token;
}
const sign = (token, what, nonce) => crypto.createHmac("sha256", token).update(`${what}:${nonce}`).digest("hex");
function verify(token, what, nonce, proof) {
  const want = Buffer.from(sign(token, what, nonce));
  const got = Buffer.from(typeof proof === "string" ? proof : "");
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

module.exports = { readToken, ensureToken, sign, verify };
