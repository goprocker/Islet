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

test("a write failure throws and keeps the stored text", () => {
  const d = tmp();
  saveNotes(d, "kept");
  fs.mkdirSync(path.join(d, "notes.txt.tmp"));
  assert.throws(() => saveNotes(d, "lost?"));
  assert.strictEqual(loadNotes(d), "kept");
  fs.rmdirSync(path.join(d, "notes.txt.tmp"));
  saveNotes(d, "retried");
  assert.strictEqual(loadNotes(d), "retried");
});

test("a folder that doesn't exist throws instead of pretending to save", () => {
  assert.throws(() => saveNotes(path.join(tmp(), "no", "such", "dir"), "hi"));
});
