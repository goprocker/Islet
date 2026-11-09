const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "../src/main.js"), "utf8");
const start = source.indexOf("// ---- file shelf:");
const end = source.indexOf("// ---- phone drop:", start);
const piece = source.slice(start, end);

function setup(existing = []) {
  const handlers = new Map(), writes = [], sent = [], drags = [];
  const files = new Set(existing);
  const icon = { isEmpty: () => false, toDataURL: () => "data:image/png;base64,a" };
  const context = {
    fs: {
      existsSync: p => files.has(p),
      writeFileSync: (p, text) => writes.push([p, text]),
    },
    path,
    app: {
      getPath: () => "C:/profile",
      getFileIcon: async () => icon,
    },
    readShelf: () => [],
    send: (channel, value) => sent.push([channel, structuredClone(value)]),
    ipcMain: { on: (name, fn) => handlers.set(name, fn) },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    shell: { showItemInFolder() {} },
    nativeImage: { createFromDataURL: () => icon },
    EMPTY_PNG: "data:image/png;base64,empty",
    console,
    Set,
    Map,
  };
  vm.runInNewContext(`${piece}; globalThis.shelfApi = { shelfAdd, saveShelf, loadShelf };`, context);
  const emit = (name, ...args) => handlers.get(name)({ sender: { startDrag: value => drags.push(value) } }, ...args);
  return { ...context.shelfApi, emit, writes, sent, drags };
}

test("Shelf add ignores missing and duplicate paths and persists the result", async () => {
  const shelf = setup(["C:/a.txt", "C:/b.txt"]);
  await shelf.shelfAdd(["C:/a.txt", "C:/missing.txt", "C:/a.txt", "C:/b.txt"]);
  assert.deepStrictEqual(JSON.parse(shelf.writes.at(-1)[1]), ["C:/a.txt", "C:/b.txt"]);
  assert.deepStrictEqual(shelf.sent.at(-1)[1].map(f => f.name), ["a.txt", "b.txt"]);
});

test("Shelf keeps only the twelve most recently added files", async () => {
  const paths = Array.from({ length: 14 }, (_, i) => `C:/file-${i}.txt`);
  const shelf = setup(paths);
  await shelf.shelfAdd(paths);
  assert.deepStrictEqual(JSON.parse(shelf.writes.at(-1)[1]), paths.slice(-12));
});

test("Shelf removal updates storage and blocks drag-out for removed paths", async () => {
  const shelf = setup(["C:/keep.txt", "C:/remove.txt"]);
  await shelf.shelfAdd(["C:/keep.txt", "C:/remove.txt"]);
  shelf.emit("shelfRemove", "C:/remove.txt");
  shelf.emit("shelfDrag", "C:/remove.txt");
  shelf.emit("shelfDrag", "C:/keep.txt");
  assert.deepStrictEqual(JSON.parse(shelf.writes.at(-1)[1]), ["C:/keep.txt"]);
  assert.strictEqual(shelf.drags.length, 1);
  assert.strictEqual(shelf.drags[0].file, "C:/keep.txt");
});
