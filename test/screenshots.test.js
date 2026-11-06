const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { tracker } = require("../screenshots");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "islet-shots-"));
const write = (dir, n, bytes = 10) => fs.writeFileSync(path.join(dir, n), Buffer.alloc(bytes));

test("screenshots: only new images are announced, once each", () => {
  const dir = tmp();
  try {
    write(dir, "Screenshot 1.png");
    const t = tracker(dir);
    assert.deepStrictEqual(t.next(), []);
    write(dir, "Screenshot 2.png");
    write(dir, "notes.txt");
    assert.deepStrictEqual(t.next(), [path.join(dir, "Screenshot 2.png")]);
    assert.deepStrictEqual(t.next(), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("screenshots: an empty file waits until it has been written", () => {
  const dir = tmp();
  try {
    const t = tracker(dir);
    write(dir, "Screenshot 3.png", 0);
    assert.deepStrictEqual(t.next(), []);
    write(dir, "Screenshot 3.png", 10);
    assert.deepStrictEqual(t.next(), [path.join(dir, "Screenshot 3.png")]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("screenshots: old images copied in are skipped, and a missing folder is not an error", () => {
  const dir = tmp();
  try {
    const t = tracker(dir);
    write(dir, "old.jpg");
    const old = (Date.now() - 3600000) / 1000;
    fs.utimesSync(path.join(dir, "old.jpg"), old, old);
    assert.deepStrictEqual(t.next(), []);
    assert.deepStrictEqual(tracker(path.join(dir, "nope")).next(), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
