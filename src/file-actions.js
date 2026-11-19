// Smart file actions for the shelf: resize, convert and compress. Each action writes a
// new file next to the original (never overwriting anything) and returns its path.
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const IMAGE = new Set([".png", ".jpg", ".jpeg", ".bmp"]);
const isImage = p => IMAGE.has(path.extname(p).toLowerCase());

// "photo.jpg" + " (half)", ".jpg" -> "photo (half).jpg", or "photo (half) 2.jpg" when taken
function outPath(p, tag, ext, exists = fs.existsSync) {
  const dir = path.dirname(p), base = path.basename(p, path.extname(p)) + tag;
  for (let n = 1; ; n++) {
    const out = path.join(dir, base + (n > 1 ? ` ${n}` : "") + ext);
    if (!exists(out)) return out;
  }
}

// the actions a file offers, as [{ id, label }]
function actionsFor(p, isDir = false) {
  const list = [];
  if (!isDir && isImage(p)) {
    const ext = path.extname(p).toLowerCase();
    list.push({ id: "half", label: "Resize to 50%" }, { id: "fit1920", label: "Resize to fit 1920 px" });
    if (ext !== ".png") list.push({ id: "png", label: "Convert to PNG" });
    if (ext !== ".jpg" && ext !== ".jpeg") list.push({ id: "jpg", label: "Convert to JPG" });
    list.push({ id: "smaller", label: "Compress image (JPG, quality 70)" });
  }
  list.push({ id: "zip", label: "Compress to ZIP" });
  return list;
}

// new size for an image: half, or scaled down to fit a box (never up)
function targetSize({ width, height }, id) {
  if (id === "half") return { width: Math.max(1, Math.round(width / 2)), height: Math.max(1, Math.round(height / 2)) };
  if (id === "fit1920") {
    const k = Math.min(1, 1920 / Math.max(width, height));
    return { width: Math.round(width * k), height: Math.round(height * k) };
  }
  return { width, height };
}

function zip(src, out) {
  return new Promise((resolve, reject) => {
    // paths go through the environment, so no quoting of user file names is needed
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      "Compress-Archive -LiteralPath $env:ISLET_SRC -DestinationPath $env:ISLET_OUT"],
      { env: { ...process.env, ISLET_SRC: src, ISLET_OUT: out }, windowsHide: true, timeout: 120000 },
      err => err ? reject(new Error("couldn't make the ZIP")) : resolve(out));
  });
}

// image work runs in image-action.ps1, its own process, so decoding, resizing and encoding a large
// image never blocks Islet's main process (#253). One image job runs at a time, so repeated actions
// can't pile up memory; the rest wait in order. exec is injectable for tests.
const SCRIPT = path.join(__dirname, "image-action.ps1");
const IMAGE_JOB = { half: ["half", null, 90], fit1920: ["fit1920", null, 90], png: ["none", "png", 0], jpg: ["none", "jpg", 90], smaller: ["none", "jpg", 70] };
const firstLine = s => String(s || "").trim().split(/\r?\n/)[0].trim();
function runImageScript(env) {
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", SCRIPT],
      { env: { ...process.env, ...env }, windowsHide: true, timeout: 120000 },
      (err, stdout, stderr) => err ? reject(new Error(firstLine(stderr) || "couldn't process the image")) : resolve(String(stdout).trim()));
  });
}
let queue = Promise.resolve();
const oneAtATime = job => { const next = queue.then(job, job); queue = next.catch(() => {}); return next; };

// run an action and return the new file's path
async function run(p, id, { exec = runImageScript } = {}) {
  if (id === "zip") return zip(p, outPath(p, "", ".zip"));
  if (!isImage(p)) throw new Error("not an image");
  const job = IMAGE_JOB[id];
  if (!job) throw new Error("unknown action");
  const ext = path.extname(p).toLowerCase(), jpgIn = ext === ".jpg" || ext === ".jpeg";
  const [mode, fixed, quality] = job;
  // resizing keeps a JPG a JPG and makes anything else a PNG, as before
  const fmt = fixed || (jpgIn ? "jpg" : "png");
  const tag = { half: " (50%)", fit1920: " (1920)", smaller: " (small)" }[id] || "";
  const outExt = fixed ? "." + fixed : jpgIn ? ext : ".png";
  return oneAtATime(async () => {
    const out = outPath(p, tag, outExt);
    await exec({ ISLET_SRC: p, ISLET_OUT: out, ISLET_MODE: mode, ISLET_FMT: fmt, ISLET_Q: String(quality || 90) });
    return out;
  });
}

module.exports = { actionsFor, outPath, targetSize, isImage, run };
