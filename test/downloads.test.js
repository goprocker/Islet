const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

// drives watch() one scan at a time instead of waiting on its timer
function run(setup, steps) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "islet-dl-"));
  const realSetTimeout = global.setTimeout;
  let scan;
  global.setTimeout = fn => { scan = fn; return 0; };
  const done = [];
  delete require.cache[require.resolve("../src/downloads")];
  const downloads = require("../src/downloads");
  try {
    setup(dir);
    downloads.watch(dir, () => {}, d => done.push(d.name));
    for (const step of steps) { step(dir); scan(); }
  } finally {
    downloads.stop();
    global.setTimeout = realSetTimeout;
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
  const realSetTimeout = global.setTimeout;
  global.setTimeout = () => 0;
  const old = fs.mkdtempSync(path.join(os.tmpdir(), "islet-dl-")), empty = fs.mkdtempSync(path.join(os.tmpdir(), "islet-dl-"));
  const seen = [];
  delete require.cache[require.resolve("../src/downloads")];
  const { watch, stop } = require("../src/downloads");
  try {
    write(old, "a.zip.crdownload", 42);
    watch(old, l => seen.push(l), () => {});
    watch(empty, l => seen.push(l), () => {});
    watch(path.join(empty, "missing"), l => seen.push(l), () => {});
  } finally {
    stop();
    global.setTimeout = realSetTimeout;
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

// the delays watch() asks for, plus the real folder watcher's open and close calls
function timing(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "islet-dl-"));
  const realSetTimeout = global.setTimeout, realWatch = fs.watch;
  const delays = [];
  let scan, open = 0;
  global.setTimeout = (f, ms) => { scan = f; delays.push(ms); return 0; };
  fs.watch = (...args) => {
    const w = realWatch(...args), close = w.close.bind(w);
    open++;
    w.close = () => { open--; close(); };
    return w;
  };
  delete require.cache[require.resolve("../src/downloads")];
  const downloads = require("../src/downloads");
  try {
    fn({ dir, downloads, delays, scan: () => scan(), open: () => open });
  } finally {
    downloads.stop();
    global.setTimeout = realSetTimeout; fs.watch = realWatch;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const noop = () => {};

test("an idle folder waits a minute between scans", () => timing(({ dir, downloads, delays }) => {
  downloads.watch(dir, noop, noop);
  assert.strictEqual(delays.at(-1), 60000);
}));
test("an active download is polled for progress, then the folder goes idle", () => timing(({ dir, downloads, delays, scan }) => {
  write(dir, "a.zip.crdownload");
  const sizes = [];
  downloads.watch(dir, l => sizes.push(l[0]?.bytes), noop);
  assert.strictEqual(delays.at(-1), 1500);
  write(dir, "a.zip.crdownload", 99);
  scan();
  assert.deepStrictEqual(sizes, [10, 99]);
  rm(dir, "a.zip.crdownload");
  scan();
  assert.strictEqual(delays.at(-1), 60000);
}));
test("a temp file that stops growing expires on the poll", () => timing(({ dir, downloads, delays, scan }) => {
  write(dir, "a.zip.crdownload");
  const lists = [];
  downloads.watch(dir, l => lists.push(l.length), noop);
  const old = Date.now() / 1000 - 120;
  fs.utimesSync(path.join(dir, "a.zip.crdownload"), old, old);
  scan();
  assert.deepStrictEqual(lists, [1, 0]);
  assert.strictEqual(delays.at(-1), 60000);
}));
test("a missing folder is retried and picked up when it appears", () => timing(({ dir, downloads, delays, scan, open }) => {
  const later = path.join(dir, "later");
  downloads.watch(later, noop, noop);
  assert.strictEqual(open(), 0);
  assert.strictEqual(delays.at(-1), 1500);
  fs.mkdirSync(later);
  scan();
  assert.strictEqual(open(), 1);
  assert.strictEqual(delays.at(-1), 60000);
  downloads.stop();
}));
test("switching folders leaves one watcher, and stop leaves none", () => timing(({ dir, downloads, open }) => {
  const other = path.join(dir, "other");
  fs.mkdirSync(other);
  downloads.watch(dir, noop, noop);
  downloads.watch(other, noop, noop);
  assert.strictEqual(open(), 1);
  downloads.stop();
  assert.strictEqual(open(), 0);
}));

test("a new temp file and its rename are noticed without waiting for the timer", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "islet-dl-"));
  delete require.cache[require.resolve("../src/downloads")];
  const downloads = require("../src/downloads");
  const until = async check => { for (let i = 0; i < 100 && !check(); i++) await new Promise(r => setTimeout(r, 20)); };
  const lists = [], done = [];
  try {
    downloads.watch(dir, l => lists.push(l.length), d => done.push(d.name));
    write(dir, "a.zip.crdownload");
    await until(() => lists.at(-1) === 1);
    assert.strictEqual(lists.at(-1), 1);
    fs.renameSync(path.join(dir, "a.zip.crdownload"), path.join(dir, "a.zip"));
    await until(() => done.length);
    await new Promise(r => setTimeout(r, 200)); // a second event mustn't announce it again
    assert.deepStrictEqual(done, ["a.zip"]);
  } finally {
    downloads.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
