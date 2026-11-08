// Phone drop: a small web page on the local network, so a phone can send files to the PC
// (they land on the shelf) and take shelf files back. It only runs while the Phone tool asks for it,
// every URL carries a random secret, and it stops by itself after 10 minutes.
const http = require("http");
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const LIFETIME = 10 * 60 * 1000;
const MAX_FILE = 2 * 1024 ** 3;
let server = null, secret = "", stopTimer = null, url = "", starting = null, abortStart = null;

// the first private IPv4 address of a real adapter (Wi-Fi or Ethernet)
function lanAddress(ifaces = os.networkInterfaces()) {
  for (const list of Object.values(ifaces)) {
    for (const a of list || []) {
      if (a.family === "IPv4" && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) return a.address;
    }
  }
  return "";
}

// a file name a phone sent, made safe to write into one folder
function safeName(name) {
  const base = path.basename(String(name || "")).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim().slice(0, 120);
  return base && base !== "." && base !== ".." ? base : "file";
}

// the same name with " (2)", " (3)" ... until it is free
function freePath(dir, name) {
  const ext = path.extname(name), stem = name.slice(0, name.length - ext.length);
  let p = path.join(dir, name);
  for (let i = 2; fs.existsSync(p); i++) p = path.join(dir, `${stem} (${i})${ext}`);
  return p;
}

// a stable id per shelf file, so a link keeps meaning the same file when the shelf changes
const fileId = p => crypto.createHash("sha256").update(secret + "|" + p).digest("hex").slice(0, 16);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const page = files => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Islet drop</title>
<style>body{margin:0;background:#000;color:#f5f5f7;font:16px system-ui,sans-serif;padding:24px 16px}h1{font-size:22px;margin:0 0 4px}p{color:#8e8e93;margin:0 0 20px}
label{display:block;background:#1c1c1e;border-radius:16px;padding:28px;text-align:center;font-weight:600}input{display:none}
ul{list-style:none;padding:0;margin:24px 0 0}li a{display:block;background:#1c1c1e;border-radius:12px;padding:12px 14px;margin-bottom:6px;color:#fff;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#s{margin-top:14px;color:#bf8cff}</style></head><body>
<h1>Islet drop</h1><p>Send files to your PC, or take files from its shelf.</p>
<label>Choose files to send<input id="f" type="file" multiple></label><div id="s"></div>
${files.length ? `<ul>${files.map((f, i) => `<li><a href="f/${f.id}" download>${esc(f.name)}</a></li>`).join("")}</ul>` : ""}
<script>document.getElementById("f").onchange=async e=>{const s=document.getElementById("s"),list=[...e.target.files],bad=[];let ok=0;
for(const f of list){s.textContent="Sending "+f.name+"…";try{const r=await fetch("up?name="+encodeURIComponent(f.name),{method:"POST",body:f});if(r.ok)ok++;else bad.push(f.name)}catch{bad.push(f.name)}}
s.textContent=bad.length?"Couldn't send "+bad.join(", ")+(ok?" ("+ok+" sent)":"")+". Pick again to retry.":(ok>1?"Sent "+ok+" files":"Sent "+list[0].name);e.target.value=""}</script></body></html>`;

// start({dir, shelf: () => [{name, path}], onFile: path => void}) -> Promise<url>
function start({ dir, shelf, onFile }) {
  clearTimeout(stopTimer);
  stopTimer = setTimeout(stop, LIFETIME);
  // one startup per session: a caller that arrives while the server is still binding shares its promise
  if (starting) return starting;
  const host = lanAddress();
  if (!host) return Promise.reject(new Error("Connect to Wi-Fi or Ethernet to use Phone drop."));
  secret = crypto.randomBytes(16).toString("hex");
  const srv = server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] !== secret) { res.writeHead(404); return res.end(); }
    const files = shelf().map(f => ({ ...f, id: fileId(f.path) }));
    if (req.method === "GET" && parts.length === 1) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return res.end(page(files));
    }
    if (req.method === "GET" && parts[1] === "f" && files.some(x => x.id === parts[2])) {
      const f = files.find(x => x.id === parts[2]);
      if (!fs.existsSync(f.path)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}` });
      return fs.createReadStream(f.path).on("error", () => res.destroy()).pipe(res);
    }
    if (req.method === "POST" && parts[1] === "up") {
      if (Number(req.headers["content-length"]) > MAX_FILE) { res.writeHead(413); return res.end(); }
      fs.mkdirSync(dir, { recursive: true });
      const p = freePath(dir, safeName(u.searchParams.get("name")));
      const tmp = path.join(dir, `.upload-${crypto.randomBytes(6).toString("hex")}.part`);
      let size = 0, done = false;
      const out = fs.createWriteStream(tmp, { flags: "wx" });
      // one idempotent exit: drop the partial file and (if still connected) answer
      const fail = code => {
        if (done) return;
        done = true;
        req.unpipe(out); out.destroy();
        fs.rm(tmp, { force: true }, () => {});
        if (!res.headersSent && !res.destroyed) { res.writeHead(code); res.end(); }
      };
      req.on("data", c => { size += c.length; if (size > MAX_FILE) { fail(413); req.destroy(); } });
      req.on("aborted", () => fail(400));
      req.on("error", () => fail(400));
      req.on("close", () => { if (!req.complete) fail(400); });
      req.pipe(out);
      out.on("finish", () => {
        if (done) return;
        done = true;
        let final = p;
        try { final = freePath(dir, path.basename(p)); fs.renameSync(tmp, final); } catch { fs.rm(tmp, { force: true }, () => {}); if (!res.destroyed) { res.writeHead(500); res.end(); } return; }
        onFile(final);
        if (!res.destroyed) { res.writeHead(200); res.end("ok"); }
      });
      out.on("error", () => fail(500));
      return;
    }
    res.writeHead(404); res.end();
  });
  starting = new Promise((resolve, reject) => {
    // closing a server that is still binding never fires its listen callback, so stop() rejects through here
    abortStart = () => reject(new Error("Phone drop was stopped."));
    srv.once("error", e => {
      if (server === srv) { clearTimeout(stopTimer); server = null; starting = null; secret = ""; abortStart = null; }
      reject(e);
    });
    srv.listen(0, host, () => {
      // stop() ran before the server finished binding: do not publish a URL for a closed session
      if (server !== srv) return reject(new Error("Phone drop was stopped."));
      abortStart = null;
      url = `http://${host}:${srv.address().port}/${secret}/`;
      resolve(url);
    });
  });
  return starting;
}

function stop() {
  clearTimeout(stopTimer);
  server?.close();
  abortStart?.();
  abortStart = null;
  server = null; starting = null; url = ""; secret = "";
}

module.exports = { start, stop, lanAddress, safeName, freePath };
