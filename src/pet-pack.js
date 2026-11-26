// Custom pets in the Codex Pets format: a pet.json plus one sprite sheet of 192x208 frames,
// 8 columns, one row per animation state (9 rows in v1, 11 in v2). The user picks a pack they
// downloaded (a .zip or its pet.json); it is checked and copied into userData/pets/<id>/.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");

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

// runs the unzip script in its own process; resolves when it ends, so the main process keeps
// serving timers and IPC while a zip unpacks (#203). exec is injectable for tests.
function runUnzip(file, tmp) {
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", UNZIP],
      { windowsHide: true, timeout: 30000, env: { ...process.env, PSModulePath: undefined, ISLET_ZIP: file, ISLET_OUT: tmp } },
      err => err ? reject(err) : resolve());
  });
}

// -> { dir: the folder holding pet.json, tmp: the temp folder to remove afterwards (zips only) }
async function unpack(file, exec) {
  if (!/\.zip$/i.test(file)) return { dir: path.dirname(file) };
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "islet-pet-"));
  try {
    // paths travel in the environment, never in the command text, so spaces and quotes are safe;
    // PSModulePath is dropped because one inherited from PowerShell 7 makes 5.1 load the wrong Expand-Archive
    try { await exec(file, tmp); } catch (e) {
      throw new Error(e.code === 3 ? "That zip is too big to be a pet." : "Couldn't unpack that zip.");
    }
    if (fs.existsSync(path.join(tmp, "pet.json"))) return { dir: tmp, tmp };
    const sub = (await fs.promises.readdir(tmp, { withFileTypes: true })).find(d => d.isDirectory() && fs.existsSync(path.join(tmp, d.name, "pet.json")));
    if (!sub) throw new Error("No pet.json inside that zip.");
    return { dir: path.join(tmp, sub.name), tmp };
  } catch (e) {
    await fs.promises.rm(tmp, { recursive: true, force: true });
    throw e;
  }
}

// checks the picked file and installs the pack as petsDir/<id>/; resolves to its info.
// The pack is built in a staging folder and swapped in only when complete, so a failed import
// leaves an installed pet with the same id as it was. One import runs at a time (#203).
let importing = Promise.resolve();
function importPack(file, petsDir, { exec = runUnzip } = {}) {
  const job = () => installPack(file, petsDir, exec);
  const next = importing.then(job, job);
  importing = next.catch(() => {});
  return next;
}
async function installPack(file, petsDir, exec) {
  const { dir, tmp } = await unpack(file, exec);
  let stage = null;
  try {
    const pack = readPack(dir);
    const dest = path.join(petsDir, pack.id);
    await fs.promises.mkdir(petsDir, { recursive: true });
    stage = await fs.promises.mkdtemp(path.join(petsDir, ".import-"));
    await fs.promises.copyFile(pack.sheet, path.join(stage, "sheet" + pack.ext));
    await fs.promises.writeFile(path.join(stage, "pet.json"), JSON.stringify({ id: pack.id, displayName: pack.name, spritesheetPath: "sheet" + pack.ext, ...(pack.version === 2 ? { spriteVersionNumber: 2 } : {}) }));
    const old = fs.existsSync(dest) ? dest + ".old-" + process.pid + "-" + Date.now() : null;
    if (old) await fs.promises.rename(dest, old);
    try { await fs.promises.rename(stage, dest); stage = null; }
    catch (e) { if (old) await fs.promises.rename(old, dest); throw e; }
    if (old) await fs.promises.rm(old, { recursive: true, force: true });
    return { id: pack.id, name: pack.name };
  } finally {
    if (stage) await fs.promises.rm(stage, { recursive: true, force: true });
    if (tmp) await fs.promises.rm(tmp, { recursive: true, force: true });
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
