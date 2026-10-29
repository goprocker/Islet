// Real app logos for notification badges and Spotify, as data URLs.
//  - Phone Link mirrored apps: the phone app's icon file named in the toast
//  - Store apps (AUMID "Family!App"): logo from the package's AppxManifest
//  - Desktop apps: icon of their Start Menu shortcut / exe
const { app, nativeImage } = require("electron");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const cache = new Map();
let index = null, indexAt = 0;

// one PowerShell call: Start Menu apps + installed Store packages
function loadIndex() {
  if (index && Date.now() - indexAt < 10 * 60 * 1000) return Promise.resolve(index);
  const cmd = "$ErrorActionPreference='SilentlyContinue'; @{ apps = @(Get-StartApps | Select-Object Name, AppID); pkgs = @(Get-AppxPackage | Select-Object PackageFamilyName, InstallLocation) } | ConvertTo-Json -Depth 3 -Compress";
  return new Promise(resolve => {
    execFile("powershell.exe", ["-NoProfile", "-Command", cmd], { windowsHide: true, maxBuffer: 32 << 20 }, (err, out) => {
      try { index = JSON.parse(out); indexAt = Date.now(); } catch { index = index || { apps: [], pkgs: [] }; }
      resolve(index);
    });
  });
}

const toUrl = img => (img && !img.isEmpty() ? img.resize({ width: 64, height: 64, quality: "best" }).toDataURL() : null);
const fromFile = p => { try { return fs.existsSync(p) ? toUrl(nativeImage.createFromPath(p)) : null; } catch { return null; } };
async function fromShell(p) {
  try { return toUrl(await app.getFileIcon(p, { size: "large" })); } catch { return null; }
}

// manifest logo like "Assets\Square44x44Logo.png" exists on disk as scaled variants
function packageLogo(dir) {
  let xml;
  try { xml = fs.readFileSync(path.join(dir, "AppxManifest.xml"), "utf8"); } catch { return null; }
  const rel = xml.match(/Square44x44Logo="([^"]+)"/)?.[1] || xml.match(/<Logo>([^<]+)<\/Logo>/)?.[1];
  if (!rel) return null;
  const full = path.join(dir, rel);
  const folder = path.dirname(full), base = path.basename(full, path.extname(full));
  let files = [];
  try { files = fs.readdirSync(folder).filter(f => f.startsWith(base) && f.endsWith(".png")); } catch { return fromFile(full); }
  // prefer a crisp 64/48px plated icon, then the biggest scale
  const pick = ["targetsize-64.png", "targetsize-48.png", "scale-200.png", "scale-150.png", "scale-100.png"]
    .map(s => files.find(f => f.endsWith(s) && !f.includes("unplated")) || files.find(f => f.endsWith(s)))
    .find(Boolean) || files[0];
  return pick ? fromFile(path.join(folder, pick)) : fromFile(full);
}

async function shortcutFor(name) {
  const roots = [
    path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs"),
    path.join(process.env.ProgramData || "C:\\ProgramData", "Microsoft", "Windows", "Start Menu", "Programs"),
  ];
  const walk = dir => {
    let list = [];
    try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const e of list) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { const r = walk(p); if (r) return r; }
      else if (e.name.toLowerCase() === `${name.toLowerCase()}.lnk`) return p;
    }
    return null;
  };
  for (const r of roots) { const hit = walk(r); if (hit) return hit; }
  return null;
}

// known-folder GUID prefixes Windows uses in AUMIDs of plain exes
const KNOWN_FOLDERS = { "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}": process.env.WINDIR + "\\System32", "{6D809377-6AF0-444B-8957-A3773F02200E}": process.env.ProgramFiles, "{7C5A40EF-A0FB-4BFC-874A-C0F2E0B9FA8E}": process.env["ProgramFiles(x86)"] };

async function resolve(aumid, xml) {
  // Phone Link: the phone app's own icon is a file in the toast
  const phoneIcon = xml.match(/src="file:\/\/\/([^"]+app_icons[^"]+)"/)?.[1];
  if (phoneIcon) return fromFile(decodeURIComponent(phoneIcon));

  const guid = aumid.match(/^(\{[0-9A-F-]+\})\\(.+)$/i);
  if (guid && KNOWN_FOLDERS[guid[1].toUpperCase()]) return fromShell(path.join(KNOWN_FOLDERS[guid[1].toUpperCase()], guid[2]));

  const idx = await loadIndex();
  if (aumid.includes("!")) {
    const family = aumid.split("!")[0];
    const pkg = idx.pkgs.find(p => p.PackageFamilyName === family);
    if (pkg?.InstallLocation) return packageLogo(pkg.InstallLocation);
  }
  const entry = idx.apps.find(a => a.AppID === aumid);
  if (entry) {
    const lnk = await shortcutFor(entry.Name);
    if (lnk) return fromShell(lnk);
  }
  if (fs.existsSync(aumid)) return fromShell(aumid);
  return null;
}

async function forNotification(aumid, xml = "") {
  // Phone Link icons differ per phone app, so key on the icon file too
  const key = aumid + (xml.match(/app_icons[^"]+/)?.[0] || "");
  if (!cache.has(key)) cache.set(key, resolve(aumid, xml).catch(() => null));
  return cache.get(key);
}

// Spotify: Store or desktop install, take the icon from its running exe
function forSpotify() {
  if (!cache.has("spotify")) {
    cache.set("spotify", new Promise(res => {
      execFile("powershell.exe", ["-NoProfile", "-Command", "(Get-Process Spotify -ErrorAction SilentlyContinue | Select-Object -First 1).Path"], { windowsHide: true }, async (err, out) => {
        const exe = out?.trim();
        if (!exe) { cache.delete("spotify"); return res(null); }
        res(await fromShell(exe) || (await forNotification("SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify")));
      });
    }));
  }
  return cache.get("spotify");
}

module.exports = { forNotification, forSpotify };
