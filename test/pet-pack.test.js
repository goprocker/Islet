const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { readPack, importPack, loadPack, imageSize, safeId } = require("../src/pet-pack");
const { frameAt } = require("../renderer/pet");

// a PNG whose header says w x h (enough for the size check)
function png(w, h) {
  const b = Buffer.alloc(33);
  b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(0x0d0a1a0a, 4);
  b.writeUInt32BE(13, 8); b.write("IHDR", 12, "ascii"); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}
function pack(meta, sheet) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pet-"));
  fs.writeFileSync(path.join(dir, "pet.json"), JSON.stringify(meta));
  if (sheet) fs.writeFileSync(path.join(dir, meta.spritesheetPath), sheet);
  return dir;
}

test("reads PNG and WebP (VP8X) sizes from their headers", () => {
  assert.deepStrictEqual(imageSize(png(1536, 1872)), { w: 1536, h: 1872 });
  const webp = Buffer.alloc(30);
  webp.write("RIFF", 0, "ascii"); webp.write("WEBP", 8, "ascii"); webp.write("VP8X", 12, "ascii");
  webp.writeUIntLE(1535, 24, 3); webp.writeUIntLE(2287, 27, 3);
  assert.deepStrictEqual(imageSize(Buffer.concat([webp, Buffer.alloc(4)])), { w: 1536, h: 2288 });
  assert.strictEqual(imageSize(Buffer.from("not an image at all, just text....")), null);
});

test("a v1 pack with the right sheet size is accepted and imported", async () => {
  const dir = pack({ id: "Tiny Robot!", displayName: "Tiny Robot", spritesheetPath: "spritesheet.png" }, png(1536, 1872));
  const p = readPack(dir);
  assert.strictEqual(p.id, "tiny-robot"); assert.strictEqual(p.version, 1);
  const pets = fs.mkdtempSync(path.join(os.tmpdir(), "pets-"));
  assert.deepStrictEqual(await importPack(path.join(dir, "pet.json"), pets), { id: "tiny-robot", name: "Tiny Robot" });
  const loaded = loadPack(pets, "tiny-robot");
  assert.strictEqual(loaded.rows, 9);
  assert.ok(loaded.sheet.startsWith("data:image/png;base64,"));
});

test("bad packs are refused with a readable reason", () => {
  assert.throws(() => readPack(fs.mkdtempSync(path.join(os.tmpdir(), "pet-"))), /pet\.json is missing/);
  assert.throws(() => readPack(pack({ id: "a", spritesheetPath: "x.gif" })), /\.webp or \.png/);
  assert.throws(() => readPack(pack({ id: "a", spritesheetPath: "s.png" })), /missing next to pet\.json/);
  assert.throws(() => readPack(pack({ id: "a", spritesheetPath: "s.png" }, png(100, 100))), /should be 1536x1872/);
  assert.throws(() => readPack(pack({ id: "a", spriteVersionNumber: 2, spritesheetPath: "s.png" }, png(1536, 1872))), /1536x2288 for a v2/);
  assert.strictEqual(safeId("../../evil"), "evil");
  assert.strictEqual(loadPack(os.tmpdir(), ""), null);
});

test("moods map to sprite rows and frames step at 8 fps", () => {
  assert.deepStrictEqual(frameAt("idle", 0, 9), { x: 0, y: 0 });
  assert.deepStrictEqual(frameAt("code", 125, 9), { x: (1 / 7) * 100, y: 87.5 }); // running row 7, frame 1
  assert.strictEqual(frameAt("ask", 0, 9).y, 75);                            // waiting row 6
  assert.strictEqual(frameAt("idle", 6 * 125, 9).x, 0);                      // idle has 6 frames, wraps
});

// zips built with Windows' own Compress-Archive, like the ones users download
function zip(dir) {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "petzip-")), "pack.zip");
  require("child_process").execFileSync("powershell.exe", ["-NoProfile", "-Command", "Compress-Archive -Path (Join-Path $env:D '*') -DestinationPath $env:O"], { env: { ...process.env, D: dir, O: out } });
  return out;
}
const unpacked = () => new Set(fs.readdirSync(os.tmpdir()).filter(n => n.startsWith("islet-pet-")));

test("imports a zipped pack and removes its temp folder", { skip: process.platform !== "win32" }, async () => {
  const before = unpacked();
  const file = zip(pack({ id: "zipped", spritesheetPath: "s.png" }, png(1536, 1872)));
  const pets = fs.mkdtempSync(path.join(os.tmpdir(), "pets-"));
  assert.strictEqual((await importPack(file, pets)).id, "zipped");
  assert.ok(fs.existsSync(path.join(pets, "zipped", "sheet.png")));
  assert.deepStrictEqual([...unpacked()].filter(n => !before.has(n)), []);
});

test("refuses a zip that unpacks too big, before writing it", { skip: process.platform !== "win32" }, async () => {
  const before = unpacked();
  const dir = pack({ id: "bomb", spritesheetPath: "s.png" }, png(1536, 1872));
  fs.writeFileSync(path.join(dir, "filler.bin"), Buffer.alloc(65 * 1024 * 1024));
  const file = zip(dir);
  assert.ok(fs.statSync(file).size < 1024 * 1024);
  await assert.rejects(importPack(file, os.tmpdir()), /too big/);
  assert.deepStrictEqual([...unpacked()].filter(n => !before.has(n)), []);
});

// #203: the unzip runs as its own process, so timers keep firing while it works
test("a zip import doesn't block the event loop", async () => {
  const dir = pack({ id: "slow", spritesheetPath: "s.png" }, png(1536, 1872));
  const pets = fs.mkdtempSync(path.join(os.tmpdir(), "pets-"));
  const exec = (_zip, tmp) => new Promise(r => setTimeout(() => {
    fs.copyFileSync(path.join(dir, "pet.json"), path.join(tmp, "pet.json"));
    fs.copyFileSync(path.join(dir, "s.png"), path.join(tmp, "s.png"));
    r();
  }, 150));
  let beats = 0;
  const hb = setInterval(() => beats++, 10);
  const id = (await importPack("x.zip", pets, { exec })).id;
  clearInterval(hb);
  assert.strictEqual(id, "slow");
  assert.ok(beats >= 5, `heartbeat ran ${beats} times`);
});

test("a failed import keeps the installed pet and leaves no staging folders", async () => {
  const pets = fs.mkdtempSync(path.join(os.tmpdir(), "pets-"));
  await importPack(path.join(pack({ id: "keep", spritesheetPath: "s.png" }, png(1536, 1872)), "pet.json"), pets);
  const before = fs.readFileSync(path.join(pets, "keep", "pet.json"), "utf8");
  await assert.rejects(importPack("bad.zip", pets, { exec: () => Promise.reject(Object.assign(new Error("x"), { code: 1 })) }), /Couldn't unpack/);
  await assert.rejects(importPack("big.zip", pets, { exec: () => Promise.reject(Object.assign(new Error("x"), { code: 3 })) }), /too big/);
  await assert.rejects(importPack(path.join(pack({ id: "keep", spritesheetPath: "s.png" }, png(10, 10)), "pet.json"), pets), /should be/);
  assert.strictEqual(fs.readFileSync(path.join(pets, "keep", "pet.json"), "utf8"), before);
  assert.deepStrictEqual(fs.readdirSync(pets), ["keep"]);
});

test("two imports of one pet at once don't mix into a partial pack", async () => {
  const pets = fs.mkdtempSync(path.join(os.tmpdir(), "pets-"));
  const a = path.join(pack({ id: "twin", displayName: "A", spritesheetPath: "s.png" }, png(1536, 1872)), "pet.json");
  const b = path.join(pack({ id: "twin", displayName: "B", spriteVersionNumber: 2, spritesheetPath: "s.webp" }, png(1536, 2288)), "pet.json");
  const r = await Promise.all([importPack(a, pets), importPack(b, pets)]);
  assert.deepStrictEqual(r.map(x => x.name), ["A", "B"]);
  assert.deepStrictEqual(fs.readdirSync(pets), ["twin"]);
  assert.deepStrictEqual(fs.readdirSync(path.join(pets, "twin")).sort(), ["pet.json", "sheet.webp"]);
});
