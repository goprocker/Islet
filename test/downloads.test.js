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

const touchLater = (dir, n, ms) => { const t = (Date.now() + ms) / 1000; fs.utimesSync(path.join(dir, n), t, t); };
const finishTwo = (d, first = "a.zip", second = "b.zip") => {
  rm(d, "Unconfirmed 1.crdownload"); rm(d, "Unconfirmed 2.crdownload");
  write(d, first, 10); write(d, second, 20);
  touchLater(d, second, 2000);
};
const twoUnconfirmed = d => { write(d, "Unconfirmed 1.crdownload", 10); write(d, "Unconfirmed 2.crdownload", 20); };

test("two Unconfirmed downloads finishing together announce one file each", () => {
  const done = run(twoUnconfirmed, [d => finishTwo(d)]);
  assert.deepStrictEqual(done.sort(), ["a.zip", "b.zip"]);
});
test("the matching does not depend on which file is newer", () => {
  const done = run(twoUnconfirmed, [d => { finishTwo(d); touchLater(d, "a.zip", 4000); }]);
  assert.deepStrictEqual(done.sort(), ["a.zip", "b.zip"]);
});
test("a cancelled Unconfirmed next to a finished one announces only the finished file", () => {
  const done = run(twoUnconfirmed, [d => { rm(d, "Unconfirmed 1.crdownload"); rm(d, "Unconfirmed 2.crdownload"); write(d, "b.zip", 25); }]);
  assert.deepStrictEqual(done, ["b.zip"]);
});
test("a new file too small for any of them announces nothing", () => {
  const done = run(twoUnconfirmed, [d => { rm(d, "Unconfirmed 1.crdownload"); rm(d, "Unconfirmed 2.crdownload"); write(d, "tiny.txt", 5); }]);
  assert.deepStrictEqual(done, []);
});
test("an exact name is taken first and isn't handed to an Unconfirmed download", () => {
  const done = run(
    d => { write(d, "named.zip.crdownload", 10); write(d, "Unconfirmed 1.crdownload", 10); },
    [d => { rm(d, "named.zip.crdownload"); rm(d, "Unconfirmed 1.crdownload"); write(d, "named.zip", 10); touchLater(d, "named.zip", 2000); write(d, "other.zip", 10); }],
  );
  assert.deepStrictEqual(done.sort(), ["named.zip", "other.zip"]);
});
test("two temp files with one real name announce it once", () => {
  const done = run(d => { write(d, "a.zip.crdownload", 10); write(d, "a.zip.part", 10); }, [d => { rm(d, "a.zip.crdownload"); rm(d, "a.zip.part"); write(d, "a.zip", 10); }]);
  assert.deepStrictEqual(done, ["a.zip"]);
});
