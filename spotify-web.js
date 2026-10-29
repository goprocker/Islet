// Spotify Web API for the extras Windows media controls can't give: like + up next.
// Login is OAuth PKCE with the user's own Client ID; tokens stay in userData.
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { shell } = require("electron");

const REDIRECT = "http://127.0.0.1:8888/callback";
const SCOPES = "user-library-read user-library-modify user-read-playback-state user-read-currently-playing";
let file, auth = null, currentId = null, liked = false;

function init(dir) {
  file = path.join(dir, "spotify-token.json");
  try { auth = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
}
const save = () => fs.writeFileSync(file, JSON.stringify(auth));
const connected = () => !!auth?.refresh;
function disconnect() { auth = null; try { fs.unlinkSync(file); } catch {} }

async function tokenRequest(params) {
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || j.error || r.status);
  auth = {
    clientId: params.client_id,
    access: j.access_token,
    refresh: j.refresh_token || auth?.refresh,
    expires: Date.now() + (j.expires_in - 60) * 1000,
  };
  save();
}

function connect(clientId) {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(12).toString("hex");
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const u = new URL(req.url, REDIRECT);
      if (u.pathname !== "/callback") { res.writeHead(404).end(); return; }
      const code = u.searchParams.get("code");
      const ok = code && u.searchParams.get("state") === state;
      res.writeHead(200, { "Content-Type": "text/html" })
        .end(ok ? "<p style='font:16px system-ui'>Spotify connected. You can close this tab.</p>"
                : "<p style='font:16px system-ui'>Spotify login was cancelled. Try again from the Islet tray menu.</p>");
      server.close();
      if (!ok) return reject(new Error(u.searchParams.get("error") || "bad state"));
      try {
        await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier });
        resolve();
      } catch (e) { reject(e); }
    });
    server.listen(8888, "127.0.0.1", () => {
      const q = new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: REDIRECT, scope: SCOPES, state, code_challenge_method: "S256", code_challenge: challenge });
      shell.openExternal(`https://accounts.spotify.com/authorize?${q}`);
    });
    setTimeout(() => { server.close(); reject(new Error("login timed out")); }, 5 * 60 * 1000);
  });
}

async function api(method, p) {
  if (Date.now() > auth.expires) await tokenRequest({ grant_type: "refresh_token", refresh_token: auth.refresh, client_id: auth.clientId });
  const r = await fetch(`https://api.spotify.com/v1${p}`, { method, headers: { Authorization: `Bearer ${auth.access}` } });
  if (r.status === 204) return null;
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

async function extras() {
  const now = await api("GET", "/me/player/currently-playing");
  currentId = now?.item?.id || null;
  if (!currentId) return { liked: false, next: null };
  const [contains, queue] = await Promise.all([
    api("GET", `/me/tracks/contains?ids=${currentId}`),
    api("GET", "/me/player/queue").catch(() => null),
  ]);
  liked = !!contains?.[0];
  const n = queue?.queue?.[0];
  return { liked, next: n ? { title: n.name, artist: (n.artists || []).map(a => a.name).join(", ") } : null };
}

async function toggleLike() {
  if (!currentId) return;
  await api(liked ? "DELETE" : "PUT", `/me/tracks?ids=${currentId}`);
  liked = !liked;
}

module.exports = { init, connect, connected, disconnect, extras, toggleLike };
