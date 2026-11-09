// Phone drop: a temporary LAN page. The QR fragment holds the secret (fragments never
// travel in HTTP); each API request proves it with a nonce-bound HMAC, so observed HTTP
// traffic cannot reveal or replay the reusable capability.
const http = require("http");
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const LIFETIME = 10 * 60 * 1000;
const MAX_FILE = 2 * 1024 ** 3;
let server = null, session = "", secret = "", stopTimer = null, url = "", starting = null, abortStart = null;
const connections = new Set(), nonces = new Set();

function lanAddress(ifaces = os.networkInterfaces()) {
  for (const list of Object.values(ifaces)) {
    for (const a of list || []) {
      if (a.family === "IPv4" && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) return a.address;
    }
  }
  return "";
}

function safeName(name) {
  const base = path.basename(String(name || "")).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim().slice(0, 120);
  return base && base !== "." && base !== ".." ? base : "file";
}

function freePath(dir, name) {
  const ext = path.extname(name), stem = name.slice(0, name.length - ext.length);
  let p = path.join(dir, name);
  for (let i = 2; fs.existsSync(p); i++) p = path.join(dir, `${stem} (${i})${ext}`);
  return p;
}

const fileId = p => crypto.createHash("sha256").update(secret + "|" + p).digest("hex").slice(0, 16);
const proof = (key, nonce, method, target) => crypto.createHmac("sha256", Buffer.from(key, "hex")).update(`${nonce}\n${method}\n${target}`).digest("hex");
function authorized(req, u) {
  const nonce = req.headers["x-islet-nonce"], got = req.headers["x-islet-proof"];
  if (typeof nonce !== "string" || !/^[0-9a-f]{32}$/.test(nonce) || nonces.has(nonce) || typeof got !== "string" || !/^[0-9a-f]{64}$/.test(got)) return false;
  const want = proof(secret, nonce, req.method, u.pathname + u.search);
  if (!crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))) return false;
  nonces.add(nonce);
  return true;
}

const page = () => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Islet drop</title>
<style>body{margin:0;background:#000;color:#f5f5f7;font:16px system-ui,sans-serif;padding:24px 16px}h1{font-size:22px;margin:0 0 4px}p{color:#8e8e93;margin:0 0 20px}
label{display:block;background:#1c1c1e;border-radius:16px;padding:28px;text-align:center;font-weight:600}input{display:none}
ul{list-style:none;padding:0;margin:24px 0 0}li button{display:block;width:100%;border:0;background:#1c1c1e;border-radius:12px;padding:12px 14px;margin-bottom:6px;color:#fff;text-align:left;font:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#s{margin-top:14px;color:#bf8cff}</style></head><body>
<h1>Islet drop</h1><p>Send files to your PC, or take files from its shelf.</p>
<label>Choose files to send<input id="f" type="file" multiple></label><div id="s"></div><ul id="files"></ul>
<script>const hex=location.hash.slice(1);history.replaceState(null,"",location.pathname);const enc=new TextEncoder();
const bytes=s=>new Uint8Array((s.match(/../g)||[]).map(x=>parseInt(x,16)));const hx=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
const K=[1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];
function sha(m){const l=m.length,n=((l+9+63)>>6)<<6,b=new Uint8Array(n);b.set(m);b[l]=128;new DataView(b.buffer).setUint32(n-4,l*8);let h=[1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225];for(let o=0;o<n;o+=64){const w=new Uint32Array(64),v=new DataView(b.buffer,o,64);for(let i=0;i<16;i++)w[i]=v.getUint32(i*4);for(let i=16;i<64;i++){const x=w[i-15],y=w[i-2],s0=(x>>>7|x<<25)^(x>>>18|x<<14)^(x>>>3),s1=(y>>>17|y<<15)^(y>>>19|y<<13)^(y>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0}let[a,c,d,e,f,g,j,k]=h;for(let i=0;i<64;i++){const s1=(f>>>6|f<<26)^(f>>>11|f<<21)^(f>>>25|f<<7),ch=(f&g)^(~f&j),t1=(k+s1+ch+K[i]+w[i])>>>0,s0=(a>>>2|a<<30)^(a>>>13|a<<19)^(a>>>22|a<<10),maj=(a&c)^(a&d)^(c&d),t2=(s0+maj)>>>0;k=j;j=g;g=f;f=(e+t1)>>>0;e=d;d=c;c=a;a=(t1+t2)>>>0}h=[h[0]+a>>>0,h[1]+c>>>0,h[2]+d>>>0,h[3]+e>>>0,h[4]+f>>>0,h[5]+g>>>0,h[6]+j>>>0,h[7]+k>>>0]}const out=new Uint8Array(32),v=new DataView(out.buffer);h.forEach((x,i)=>v.setUint32(i*4,x));return out}
function hmac(k,m){const i=new Uint8Array(64),o=new Uint8Array(64);i.fill(54);o.fill(92);k.forEach((x,n)=>{i[n]^=x;o[n]^=x});const inner=new Uint8Array(64+m.length);inner.set(i);inner.set(m,64);const ih=sha(inner),outer=new Uint8Array(96);outer.set(o);outer.set(ih,64);return sha(outer)}
async function signed(rel,options={}){const u=new URL(rel,location.href),nonce=hx(crypto.getRandomValues(new Uint8Array(16))),method=options.method||"GET",target=u.pathname+u.search,p=hx(hmac(bytes(hex),enc.encode(nonce+"\\n"+method+"\\n"+target)));return fetch(u,{...options,headers:{...(options.headers||{}),"X-Islet-Nonce":nonce,"X-Islet-Proof":p}})}
async function load(){const r=await signed("list");if(!r.ok)return;const list=await r.json(),ul=document.getElementById("files");for(const f of list){const li=document.createElement("li"),b=document.createElement("button");b.textContent=f.name;b.onclick=async()=>{const x=await signed("f/"+f.id);if(!x.ok)return;const a=document.createElement("a");a.href=URL.createObjectURL(await x.blob());a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};li.append(b);ul.append(li)}}
document.getElementById("f").onchange=async e=>{const s=document.getElementById("s"),list=[...e.target.files],bad=[];let ok=0;for(const f of list){s.textContent="Sending "+f.name+"...";try{const r=await signed("up?name="+encodeURIComponent(f.name),{method:"POST",body:f});if(r.ok)ok++;else bad.push(f.name)}catch{bad.push(f.name)}}s.textContent=bad.length?"Couldn't send "+bad.join(", ")+(ok?" ("+ok+" sent)":"")+". Pick again to retry.":(ok>1?"Sent "+ok+" files":"Sent "+list[0].name);e.target.value=""};load()</script></body></html>`;

function start({ dir, shelf, onFile, lifetime = LIFETIME }) {
  clearTimeout(stopTimer);
  stopTimer = setTimeout(stop, lifetime);
  // one startup per session: a caller that arrives while the server is still binding shares its promise
  if (starting) return starting;
  const host = lanAddress();
  if (!host) return Promise.reject(new Error("Connect to Wi-Fi or Ethernet to use Phone drop."));
  session = crypto.randomBytes(8).toString("hex");
  secret = crypto.randomBytes(32).toString("hex");
  nonces.clear();
  const srv = server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x"), parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] !== session) { res.writeHead(404); return res.end(); }
    if (req.method === "GET" && parts.length === 1) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return res.end(page());
    }
    if (!authorized(req, u)) { res.writeHead(401, { "cache-control": "no-store" }); return res.end(); }
    const files = shelf().map(f => ({ ...f, id: fileId(f.path) }));
    if (req.method === "GET" && parts[1] === "list") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(JSON.stringify(files.map(({ id, name }) => ({ id, name }))));
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
      const fail = code => {
        if (done) return;
        done = true; req.unpipe(out); out.destroy(); fs.rm(tmp, { force: true }, () => {});
        if (!res.headersSent && !res.destroyed) { res.writeHead(code); res.end(); }
      };
      req.on("data", c => { size += c.length; if (size > MAX_FILE) { fail(413); req.destroy(); } });
      req.on("aborted", () => fail(400)); req.on("error", () => fail(400));
      req.on("close", () => { if (!req.complete) fail(400); });
      req.pipe(out);
      out.on("finish", () => {
        if (done) return;
        done = true;
        let final = p;
        try { final = freePath(dir, path.basename(p)); fs.renameSync(tmp, final); }
        catch { fs.rm(tmp, { force: true }, () => {}); if (!res.destroyed) { res.writeHead(500); res.end(); } return; }
        onFile(final); if (!res.destroyed) { res.writeHead(200); res.end("ok"); }
      });
      out.on("error", () => fail(500));
      return;
    }
    res.writeHead(404); res.end();
  });
  srv.on("connection", socket => {
    connections.add(socket);
    socket.once("close", () => connections.delete(socket));
  });
  starting = new Promise((resolve, reject) => {
    // closing a server that is still binding never fires its listen callback, so stop() rejects through here
    abortStart = () => reject(new Error("Phone drop was stopped."));
    srv.once("error", e => {
      if (server === srv) { clearTimeout(stopTimer); server = null; starting = null; session = ""; secret = ""; nonces.clear(); abortStart = null; }
      reject(e);
    });
    srv.listen(0, host, () => {
      // stop() ran before the server finished binding: do not publish a URL for a closed session
      if (server !== srv) return reject(new Error("Phone drop was stopped."));
      abortStart = null;
      url = `http://${host}:${srv.address().port}/${session}/#${secret}`;
      resolve(url);
    });
  });
  return starting;
}

function stop() {
  clearTimeout(stopTimer); server?.close();
  for (const socket of connections) socket.destroy();
  connections.clear(); nonces.clear();
  abortStart?.();
  abortStart = null;
  server = null; starting = null; url = ""; session = ""; secret = "";
}

module.exports = { start, stop, lanAddress, safeName, freePath, proof };
