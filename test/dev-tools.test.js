const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const dev = require("../src/dev-tools");
const gh = require("../src/github-notify");

test("git: branch, ahead/behind and changed files", () => {
  const out = [
    "# branch.oid abc",
    "# branch.head main",
    "# branch.upstream origin/main",
    "# branch.ab +2 -1",
    "1 .M N... 100644 100644 100644 aaa bbb src/main.js",
    "1 A. N... 000000 100644 100644 000 ccc src/new file.js",
    "2 R. N... 100644 100644 100644 ddd eee R100 src/b.js\tsrc/a.js",
    "? notes.txt",
  ].join("\n");
  const g = dev.parseGit(out);
  assert.equal(g.branch, "main");
  assert.equal(g.ahead, 2);
  assert.equal(g.behind, 1);
  assert.deepEqual(g.files, [
    { code: "M", file: "src/main.js" },
    { code: "A", file: "src/new file.js" },
    { code: "R", file: "src/b.js" },
    { code: "?", file: "notes.txt" },
  ]);
  assert.deepEqual(dev.parseGit(""), { branch: "", ahead: 0, behind: 0, files: [] });
});

test("ports: dev listeners only, one per port, with process names", () => {
  const net = [
    "  Proto  Local Address          Foreign Address        State           PID",
    "  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1100",
    "  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       4242",
    "  TCP    [::]:3000              [::]:0                 LISTENING       4242",
    "  TCP    127.0.0.1:5173         0.0.0.0:0              LISTENING       5151",
    "  TCP    127.0.0.1:5173         127.0.0.1:50000        ESTABLISHED     5151",
    "  TCP    0.0.0.0:8080           0.0.0.0:0              LISTENING       4",
  ].join("\r\n");
  assert.deepEqual(dev.parseNetstat(net), [{ port: 3000, pid: 4242 }, { port: 5173, pid: 5151 }]);
  const names = dev.parseTasklist('"node.exe","4242","Console","1","50,000 K"\r\n"vite.exe","5151","Console","1","1 K"');
  assert.equal(names.get(4242), "node.exe");
  assert.equal(names.get(5151), "vite.exe");
});

test("decode: JWT, JSON, timestamps, base64, URL encoding", () => {
  const b = o => Buffer.from(JSON.stringify(o)).toString("base64url");
  const jwt = dev.decode(`${b({ alg: "HS256" })}.${b({ sub: "42", exp: 1 })}.sig`);
  assert.equal(jwt.kind, "jwt");
  assert.match(jwt.text, /"sub": "42"/);
  assert.match(jwt.text, /expired/);
  assert.equal(dev.decode('{"a":1}').text, '{\n  "a": 1\n}');
  assert.equal(dev.decode("1700000000").kind, "time");
  assert.match(dev.decode("1700000000000").text, /^2023-11-14T22:13:20/);
  assert.equal(dev.decode("2023-11-14T22:13:20Z").text.split("\n")[0], "1700000000");
  assert.equal(dev.decode("aGVsbG8gd29ybGQ=").text, "hello world");
  assert.equal(dev.decode("a%20b%2Fc").text, "a b/c");
  assert.equal(dev.decode("just words"), null);
  assert.equal(dev.decode("abcdefgh"), null); // a plain word isn't base64
  assert.equal(dev.decode(""), null);
});

test("snippets: defaults, save, and junk filtered", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "islet-snip-"));
  assert.deepEqual(dev.loadSnippets(dir), dev.DEFAULT_SNIPPETS);
  const saved = dev.saveSnippets(dir, [{ name: "", text: "ls -la" }, { text: "  " }, null, { name: "x", text: 5 }]);
  assert.deepEqual(saved, [{ name: "ls -la", text: "ls -la" }]);
  assert.deepEqual(dev.loadSnippets(dir), saved);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("github: only new notifications, with page links", () => {
  const seen = new Set();
  const list = [{ id: "1", reason: "review_requested", repository: { full_name: "o/r" }, subject: { title: "Fix it", url: "https://api.github.com/repos/o/r/pulls/7" } }];
  assert.deepEqual(gh.fresh(list, seen), [{ id: "1", repo: "o/r", title: "Fix it", reason: "Review requested", url: "https://github.com/o/r/pull/7" }]);
  assert.deepEqual(gh.fresh(list, seen), []);
  assert.deepEqual(gh.fresh(null, seen), []);
});

test("github: the first poll is silent, later ones announce", () => {
  const replies = ['[{"id":"1","subject":{}}]', '[{"id":"1","subject":{}},{"id":"2","subject":{"title":"New"}}]'];
  const got = [];
  let calls = 0;
  const realSetTimeout = global.setTimeout;
  global.setTimeout = fn => { if (calls < 2) fn(); return 0; };
  try {
    gh.start(list => got.push(...list.map(n => n.id)), cb => cb(null, replies[calls++] || "[]"));
  } finally { global.setTimeout = realSetTimeout; }
  assert.deepEqual(got, ["2"]);
});
