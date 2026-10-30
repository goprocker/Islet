const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "../renderer/notch.js"), "utf8");
const start = source.indexOf("// tint the notch with the album art");
const piece = source.slice(start, source.indexOf("let lyricLines", start));

// the real accentFrom with images that finish loading when the test says so
function setup() {
  const images = [], writes = [];
  const context = {
    theme: { accent: "album" },
    Image: function () { images.push(this); },
    document: {
      createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData: () => ({ data: [255, 0, 0, 255] }) }) }),
      documentElement: { style: { setProperty: (k, v) => writes.push(v) } },
    },
  };
  vm.runInNewContext(piece + "\nglobalThis.accentFrom = accentFrom; globalThis.bump = () => accentRequest++;", context);
  return { context, images, writes };
}

test("a cover that finishes loading sets the accent", () => {
  const { context, images, writes } = setup();
  context.accentFrom("art");
  images[0].onload();
  assert.deepStrictEqual(writes, ["rgb(255,0,0)"]);
});
test("a fixed colour chosen while the cover loads stays", () => {
  const { context, images, writes } = setup();
  context.accentFrom("art");
  context.theme.accent = "#123456";
  images[0].onload();
  assert.deepStrictEqual(writes, []);
});
test("the older of two covers can't overwrite the newer one", () => {
  const { context, images, writes } = setup();
  context.accentFrom("old");
  context.accentFrom("new");
  images[1].onload();
  images[0].onload();
  assert.strictEqual(writes.length, 1);
});
test("back to album colours while an old cover loads: only the new request counts", () => {
  const { context, images, writes } = setup();
  context.accentFrom("old");
  context.theme.accent = "#123456";
  context.accentFrom("old"); // does nothing but outdate the first
  context.theme.accent = "album";
  images[0].onload();
  assert.deepStrictEqual(writes, []);
  context.accentFrom("new");
  images[1].onload();
  assert.strictEqual(writes.length, 1);
});
test("a song without a cover cancels the one still loading", () => {
  const { context, images, writes } = setup();
  context.accentFrom("old");
  context.bump(); // what onMedia does when the art goes away
  images[0].onload();
  assert.deepStrictEqual(writes, []);
  assert.match(source, /else \{\s+accentRequest\+\+;/);
});
