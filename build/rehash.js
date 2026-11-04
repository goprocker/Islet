// Rebuilds the .blockmap and the latest.yml hash for an installer that was
// changed after electron-builder made them (by code signing).
// Usage: node build/rehash.js dist/Islet-Setup-X.exe
const fs = require("fs"), path = require("path");
const { buildBlockMap } = require("app-builder-lib/out/targets/blockmap/blockmap");

(async () => {
  const exe = process.argv[2];
  const info = await buildBlockMap(exe, "gzip", exe + ".blockmap");
  const yml = path.join(path.dirname(exe), "latest.yml");
  const text = fs.readFileSync(yml, "utf8")
    .replace(/sha512: .+/g, `sha512: ${info.sha512}`)
    .replace(/size: \d+/g, `size: ${info.size}`);
  fs.writeFileSync(yml, text);
  console.log(`rehashed ${exe}: ${info.size} bytes`);
})().catch(e => { console.error(e); process.exit(1); });
