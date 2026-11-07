const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadNotes, saveNotes, MAX } = require("../src/notes");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "islet-notes-"));

test("missing file loads as empty", () => {
  assert.strictEqual(loadNotes(tmp()), "");
});

test("saved text round-trips, including unicode and newlines", () => {
  const d = tmp();
  saveNotes(d, "buy milk\n✓ call mum");
  assert.strictEqual(loadNotes(d), "buy milk\n✓ call mum");
});

test("text is clamped and non-strings are stored as empty", () => {
  const d = tmp();
  assert.strictEqual(saveNotes(d, "x".repeat(MAX + 50)).length, MAX);
  assert.strictEqual(saveNotes(d, 42), "");
  assert.strictEqual(loadNotes(d), "");
});

test("a write failure doesn't throw", () => {
  assert.doesNotThrow(() => saveNotes(path.join(tmp(), "no", "such", "dir"), "hi"));
});
