const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fa = require("../src/file-actions");

test("images get resize/convert/compress, everything gets zip", () => {
  assert.deepStrictEqual(fa.actionsFor("a.png").map(a => a.id), ["half", "fit1920", "jpg", "smaller", "zip"]);
  assert.deepStrictEqual(fa.actionsFor("a.JPG").map(a => a.id), ["half", "fit1920", "png", "smaller", "zip"]);
  assert.deepStrictEqual(fa.actionsFor("a.pdf").map(a => a.id), ["zip"]);
  assert.deepStrictEqual(fa.actionsFor("pics.png", true).map(a => a.id), ["zip"]);
});

test("outPath never overwrites", () => {
  const taken = new Set([path.join("d", "a (50%).png"), path.join("d", "a (50%) 2.png")]);
  assert.strictEqual(fa.outPath(path.join("d", "a.png"), " (50%)", ".png", p => taken.has(p)), path.join("d", "a (50%) 3.png"));
  assert.strictEqual(fa.outPath(path.join("d", "a.png"), "", ".zip", () => false), path.join("d", "a.zip"));
});

test("targetSize halves and fits without upscaling", () => {
  assert.deepStrictEqual(fa.targetSize({ width: 3840, height: 2160 }, "fit1920"), { width: 1920, height: 1080 });
  assert.deepStrictEqual(fa.targetSize({ width: 800, height: 600 }, "fit1920"), { width: 800, height: 600 });
  assert.deepStrictEqual(fa.targetSize({ width: 1, height: 3 }, "half"), { width: 1, height: 2 });
});

test("run rejects non-images for image actions", async () => {
  await assert.rejects(fa.run("x.pdf", "half", {}), /not an image/);
});

test("image actions go to the helper with the right options, one at a time (#253)", async () => {
  const calls = []; let running = 0, most = 0;
  const exec = async env => { running++; most = Math.max(most, running); calls.push(env); await new Promise(r => setTimeout(r, 20)); running--; return "1x1"; };
  const p = path.join("d", "a.png");
  const outs = await Promise.all(["half", "fit1920", "jpg", "smaller"].map(id => fa.run(p, id, { exec })));
  assert.strictEqual(most, 1, "never more than one image job at once");
  assert.deepStrictEqual(calls.map(c => [c.ISLET_MODE, c.ISLET_FMT, c.ISLET_Q]), [["half", "png", "90"], ["fit1920", "png", "90"], ["none", "jpg", "90"], ["none", "jpg", "70"]]);
  assert.deepStrictEqual(outs.map(o => path.basename(o)), ["a (50%).png", "a (1920).png", "a.jpg", "a (small).jpg"]);
  const j = await fa.run(path.join("d", "b.JPG"), "half", { exec });
  assert.strictEqual(path.basename(j), "b (50%).jpg", "a resized JPG stays a JPG");
});

test("a failed image job rejects and the next one still runs (#253)", async () => {
  let n = 0;
  const exec = async () => { if (n++ === 0) throw new Error("couldn't read the image"); return "1x1"; };
  await assert.rejects(fa.run(path.join("d", "a.png"), "png", { exec }), /couldn't read the image/);
  assert.ok(await fa.run(path.join("d", "a.png"), "png", { exec }));
  await assert.rejects(fa.run(path.join("d", "a.png"), "nope", { exec }), /unknown action/);
});

test("on Windows the real helper resizes without blocking the event loop (#253)", { skip: process.platform !== "win32" }, async () => {
  const fs = require("fs"), os = require("os");
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "fa-"));
  try {
    // a 2x2 PNG: write it through the helper itself from a BMP made by hand
    const bmp = Buffer.alloc(70); bmp.write("BM"); bmp.writeUInt32LE(70, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
    bmp.writeInt32LE(2, 18); bmp.writeInt32LE(2, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28); bmp.fill(200, 54);
    const src = path.join(d, "a.bmp"); fs.writeFileSync(src, bmp);
    let ticks = 0; const t = setInterval(() => ticks++, 10);
    const out = await fa.run(src, "half");
    clearInterval(t);
    assert.ok(ticks > 3, "timers kept running while the helper worked");
    assert.strictEqual(path.basename(out), "a (50%).png");
    const png = fs.readFileSync(out);
    assert.strictEqual(png.readUInt32BE(16), 1); assert.strictEqual(png.readUInt32BE(20), 1);
    // the original is untouched and a second run never overwrites the first
    assert.strictEqual(fs.readFileSync(src).length, 70);
    assert.strictEqual(path.basename(await fa.run(src, "half")), "a (50%) 2.png");
    await assert.rejects(fa.run(path.join(d, "missing.png"), "png"), /couldn't read the image/);
    assert.ok(!fs.existsSync(path.join(d, "missing.png")));
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
