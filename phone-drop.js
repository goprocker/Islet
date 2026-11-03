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
let server = null, secret = "", stopTimer = null, url = "";

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

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const page = files => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Islet drop</title>
<style>body{margin:0;background:#000;color:#f5f5f7;font:16px system-ui,sans-serif;padding:24px 16px}h1{font-size:22px;margin:0 0 4px}p{color:#8e8e93;margin:0 0 20px}
label{display:block;background:#1c1c1e;border-radius:16px;padding:28px;text-align:center;font-weight:600}input{display:none}
ul{list-style:none;padding:0;margin:24px 0 0}li a{display:block;background:#1c1c1e;border-radius:12px;padding:12px 14px;margin-bottom:6px;color:#fff;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#s{margin-top:14px;color:#bf8cff}</style></head><body>
<h1>Islet drop</h1><p>Send files to your PC, or take files from its shelf.</p>
<label>Choose files to send<input id="f" type="file" multiple></label><div id="s"></div>
${files.length ? `<ul>${files.map((f, i) => `<li><a href="f/${i}" download>${esc(f.name)}</a></li>`).join("")}</ul>` : ""}
<script>document.getElementById("f").onchange=async e=>{const s=document.getElementById("s");for(const f of e.target.files){s.textContent="Sending "+f.name+"…";
const r=await fetch("up?name="+encodeURIComponent(f.name),{method:"POST",body:f});s.textContent=r.ok?"Sent "+f.name:"Couldn't send "+f.name}}</script></body></html>`;

// start({dir, shelf: () => [{name, path}], onFile: path => void}) -> Promise<url>
function start({ dir, shelf, onFile }) {
  clearTimeout(stopTimer);
  stopTimer = setTimeout(stop, LIFETIME);
  if (server) return Promise.resolve(url);
  const host = lanAddress();
  if (!host) return Promise.reject(new Error("Connect to Wi-Fi or Ethernet to use Phone drop."));
  secret = crypto.randomBytes(16).toString("hex");
  server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] !== secret) { res.writeHead(404); return res.end(); }
    const files = shelf();
    if (req.method === "GET" && parts.length === 1) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return res.end(page(files));
    }
    if (req.method === "GET" && parts[1] === "f" && files[Number(parts[2])]) {
      const f = files[Number(parts[2])];
      res.writeHead(200, { "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}` });
      return fs.createReadStream(f.path).on("error", () => res.destroy()).pipe(res);
    }
    if (req.method === "POST" && parts[1] === "up") {
      if (Number(req.headers["content-length"]) > MAX_FILE) { res.writeHead(413); return res.end(); }
      fs.mkdirSync(dir, { recursive: true });
      const p = freePath(dir, safeName(u.searchParams.get("name")));
      let size = 0;
      const out = fs.createWriteStream(p);
      req.on("data", c => { size += c.length; if (size > MAX_FILE) { req.destroy(); out.destroy(); fs.rm(p, () => {}); } });
      req.pipe(out);
      out.on("finish", () => { onFile(p); res.writeHead(200); res.end("ok"); });
      out.on("error", () => { res.writeHead(500); res.end(); });
      return;
    }
    res.writeHead(404); res.end();
  });
  return new Promise((resolve, reject) => {
    server.once("error", e => { server = null; reject(e); });
    server.listen(0, host, () => { url = `http://${host}:${server.address().port}/${secret}/`; resolve(url); });
  });
}

function stop() {
  clearTimeout(stopTimer);
  server?.close();
  server = null; url = ""; secret = "";
}

module.exports = { start, stop, lanAddress, safeName, freePath };
