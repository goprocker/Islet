const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

// drives watch() one scan at a time instead of waiting on its timer
function run(setup, steps) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "islet-dl-"));
  const realSetInterval = global.setInterval;
  let scan;
  global.setInterval = fn => { scan = fn; return 0; };
  const done = [];
  delete require.cache[require.resolve("../downloads")];
  try {
    setup(dir);
    require("../downloads").watch(dir, () => {}, d => done.push(d.name));
    for (const step of steps) { step(dir); scan(); }
  } finally {
    global.setInterval = realSetInterval;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return done;
}
const write = (dir, n, bytes = 10) => fs.writeFileSync(path.join(dir, n), Buffer.alloc(bytes));
const rm = (dir, n) => fs.rmSync(path.join(dir, n));

test("cancelled download announces nothing, even with another recent file", () => {
  const done = run(d => { write(d, "a.zip.crdownload"); write(d, "unrelated.txt"); }, [d => rm(d, "a.zip.crdownload")]);
  assert.deepStrictEqual(done, []);
});
test("finished download announces its own file", () => {
  const done = run(d => { write(d, "a.zip.crdownload"); write(d, "unrelated.txt"); }, [d => { rm(d, "a.zip.crdownload"); write(d, "a.zip"); }]);
  assert.deepStrictEqual(done, ["a.zip"]);
});
test("Chrome's Unconfirmed name maps to the new file", () => {
  const done = run(d => { write(d, "Unconfirmed 12345.crdownload", 50); write(d, "old.txt", 100); }, [d => { rm(d, "Unconfirmed 12345.crdownload"); write(d, "report.pdf", 60); }]);
  assert.deepStrictEqual(done, ["report.pdf"]);
});
test("stale temp file that still exists is not a completion", () => {
  const done = run(d => write(d, "b.zip.crdownload"), [d => { const old = Date.now() / 1000 - 120; fs.utimesSync(path.join(d, "b.zip.crdownload"), old, old); write(d, "b.zip"); }]);
  assert.deepStrictEqual(done, []);
});

test("switching to an empty folder reports an empty list", () => {
  const realSetInterval = global.setInterval;
  global.setInterval = () => 0;
  const old = fs.mkdtempSync(path.join(os.tmpdir(), "islet-dl-")), empty = fs.mkdtempSync(path.join(os.tmpdir(), "islet-dl-"));
  const seen = [];
  delete require.cache[require.resolve("../downloads")];
  try {
    write(old, "a.zip.crdownload", 42);
    const { watch } = require("../downloads");
    watch(old, l => seen.push(l), () => {});
    watch(empty, l => seen.push(l), () => {});
    watch(path.join(empty, "missing"), l => seen.push(l), () => {});
  } finally {
    global.setInterval = realSetInterval;
    fs.rmSync(old, { recursive: true, force: true }); fs.rmSync(empty, { recursive: true, force: true });
  }
  assert.deepStrictEqual(seen, [[{ name: "a.zip", bytes: 42 }], [], []]);
});
