// Custom pets in the Codex Pets format: a pet.json plus one sprite sheet of 192x208 frames,
// 8 columns, one row per animation state (9 rows in v1, 11 in v2). The user picks a pack they
// downloaded (a .zip or its pet.json); it is checked and copied into userData/pets/<id>/.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const SHEETS = { 1: { w: 1536, h: 1872 }, 2: { w: 1536, h: 2288 } };
const MAX_SHEET = 20 * 1024 * 1024;
const IMAGE = /\.(webp|png)$/i;
// a pack is a pet.json and one sheet; a zip far bigger than that is refused before it is unpacked
const MAX_ENTRIES = 64;
const MAX_UNZIPPED = 64 * 1024 * 1024;

// a pet id that is safe as a folder name
const safeId = s => String(s || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "pet";

// PNG and WebP keep their size in the first bytes; anything else is refused
function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.length > 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const kind = buf.toString("ascii", 12, 16);
    if (kind === "VP8X") return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    if (kind === "VP8L") { const b = buf.readUInt32LE(21); return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) }; }
    if (kind === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

// reads and checks the pack in a folder -> { id, name, version, sheet (absolute path), ext }; throws a readable Error
function readPack(dir) {
  let meta;
  try { meta = JSON.parse(fs.readFileSync(path.join(dir, "pet.json"), "utf8")); } catch { throw new Error("This isn't a pet: pet.json is missing or unreadable."); }
  const file = path.basename(String(meta.spritesheetPath || ""));
  if (!IMAGE.test(file)) throw new Error("The pet's sprite sheet must be a .webp or .png file.");
  const sheet = path.join(dir, file);
  if (!fs.existsSync(sheet)) throw new Error(`The sprite sheet ${file} is missing next to pet.json.`);
  if (fs.statSync(sheet).size > MAX_SHEET) throw new Error("The sprite sheet is too large (over 20 MB).");
  const size = imageSize(fs.readFileSync(sheet));
  const version = meta.spriteVersionNumber === 2 ? 2 : 1;
  const want = SHEETS[version];
  if (!size || size.w !== want.w || size.h !== want.h) throw new Error(`The sprite sheet should be ${want.w}x${want.h} for a v${version} pet.`);
  return { id: safeId(meta.id || meta.displayName), name: String(meta.displayName || meta.id || "Pet").slice(0, 40), version, sheet, ext: path.extname(file).toLowerCase() };
}

// a picked .zip is unpacked with Windows' own Expand-Archive into a temp folder
// the zip's directory is read first: too many entries or unpacked bytes exits with code 3
// before anything is written, so a zip bomb can't fill the disk
const UNZIP = `Add-Type -AssemblyName System.IO.Compression.FileSystem
$z = [IO.Compression.ZipFile]::OpenRead($env:ISLET_ZIP)
try { $n = $z.Entries.Count; $b = [long]($z.Entries | Measure-Object -Property Length -Sum).Sum } finally { $z.Dispose() }
if ($n -gt ${MAX_ENTRIES} -or $b -gt ${MAX_UNZIPPED}) { exit 3 }
Expand-Archive -LiteralPath $env:ISLET_ZIP -DestinationPath $env:ISLET_OUT -Force`;

// -> { dir: the folder holding pet.json, tmp: the temp folder to remove afterwards (zips only) }
function unpack(file) {
  if (!/\.zip$/i.test(file)) return { dir: path.dirname(file) };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "islet-pet-"));
  try {
    // paths travel in the environment, never in the command text, so spaces and quotes are safe
    try {
      execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", UNZIP], { windowsHide: true, timeout: 30000, stdio: "pipe", env: { ...process.env, ISLET_ZIP: file, ISLET_OUT: tmp } });
    } catch (e) {
      throw new Error(e.status === 3 ? "That zip is too big to be a pet." : "Couldn't unpack that zip.");
    }
    if (fs.existsSync(path.join(tmp, "pet.json"))) return { dir: tmp, tmp };
    const sub = fs.readdirSync(tmp, { withFileTypes: true }).find(d => d.isDirectory() && fs.existsSync(path.join(tmp, d.name, "pet.json")));
    if (!sub) throw new Error("No pet.json inside that zip.");
    return { dir: path.join(tmp, sub.name), tmp };
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw e;
  }
}

// checks the picked file and copies the pack into petsDir/<id>/; returns its info
function importPack(file, petsDir) {
  const { dir, tmp } = unpack(file);
  try {
    const pack = readPack(dir);
    const dest = path.join(petsDir, pack.id);
    fs.mkdirSync(dest, { recursive: true });
    fs.copyFileSync(pack.sheet, path.join(dest, "sheet" + pack.ext));
    fs.writeFileSync(path.join(dest, "pet.json"), JSON.stringify({ id: pack.id, displayName: pack.name, spritesheetPath: "sheet" + pack.ext, ...(pack.version === 2 ? { spriteVersionNumber: 2 } : {}) }));
    return { id: pack.id, name: pack.name };
  } finally {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// the installed pack as the renderer needs it: name, rows and the sheet as a data URL (or null)
function loadPack(petsDir, id) {
  if (!id) return null;
  try {
    const p = readPack(path.join(petsDir, safeId(id)));
    const mime = p.ext === ".png" ? "image/png" : "image/webp";
    return { id: p.id, name: p.name, rows: p.version === 2 ? 11 : 9, sheet: `data:${mime};base64,${fs.readFileSync(p.sheet).toString("base64")}` };
  } catch (e) { console.warn("pet", e.message); return null; }
}

module.exports = { readPack, importPack, loadPack, imageSize, safeId };
