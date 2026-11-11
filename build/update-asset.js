// Gives auto-update its own copy of the installer, so updates don't count as downloads.
// GitHub counts every download per asset, and the site shows the Islet-Setup-*.exe total.
// This copies Islet-Setup-X.exe (and its .blockmap) to Islet-Update-X.exe and points
// latest.yml at the copy; the bytes, and so the sha512 and size, are identical.
// Usage: node build/update-asset.js dist X.Y.Z
const fs = require("fs"), path = require("path");

function updateAsset(dir, version) {
  const setup = `Islet-Setup-${version}.exe`, update = `Islet-Update-${version}.exe`;
  fs.copyFileSync(path.join(dir, setup), path.join(dir, update));
  fs.copyFileSync(path.join(dir, setup + ".blockmap"), path.join(dir, update + ".blockmap"));
  const yml = path.join(dir, "latest.yml");
  const text = fs.readFileSync(yml, "utf8");
  if (!text.includes(setup)) throw new Error(`latest.yml doesn't name ${setup}`);
  fs.writeFileSync(yml, text.split(setup).join(update));
  return update;
}

module.exports = { updateAsset };

if (require.main === module) {
  const [dir, version] = process.argv.slice(2);
  try { console.log("auto-update uses", updateAsset(dir, version)); } catch (e) { console.error(e.message); process.exit(1); }
}
