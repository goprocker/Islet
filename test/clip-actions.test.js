const test = require("node:test");
const assert = require("node:assert");
const { available, run, cleanUrl } = require("../src/clip-actions");

test("clean link drops trackers and keeps real params", () => {
  assert.strictEqual(cleanUrl("https://x.com/a?id=5&utm_source=tw&fbclid=abc"), "https://x.com/a?id=5");
  assert.strictEqual(cleanUrl("https://x.com/a?utm_medium=m"), "https://x.com/a");
  assert.strictEqual(cleanUrl("https://www.amazon.in/Some-Thing/dp/B0ABCDEF12/ref=sr_1?keywords=x"), "https://www.amazon.in/dp/B0ABCDEF12");
});
test("only sensible actions are offered", () => {
  const ids = t => available(t).map(a => a.id);
  assert.ok(ids("https://a.b/?utm_x=1").includes("cleanUrl"));
  assert.ok(!ids("https://a.b/c").includes("cleanUrl"), "nothing to clean");
  assert.ok(!ids("hello world").includes("jsonPretty"));
  assert.ok(ids('{"a":1}').includes("jsonPretty"));
  assert.ok(!ids("HELLO").includes("upper"), "no-op hidden");
  assert.ok(!ids("hello world").includes("b64decode"));
  assert.ok(!ids("https://a.b/?utm_x=1").includes("camel"), "no case changes on links");
  assert.deepStrictEqual(available(""), []);
});
test("transforms", () => {
  assert.strictEqual(run("camel", "user profile id"), "userProfileId");
  assert.strictEqual(run("snake", "userProfileId"), "user_profile_id");
  assert.strictEqual(run("kebab", "User Profile"), "user-profile");
  assert.strictEqual(run("title", "the quick fox"), "The Quick Fox");
  assert.strictEqual(run("trim", "  a   b \n\n\n\n c  "), "a b\n\nc");
  assert.strictEqual(run("oneLine", "a\n  b"), "a b");
  assert.strictEqual(run("sortLines", "b\na\nc"), "a\nb\nc");
  assert.strictEqual(run("uniqLines", "a\nb\na"), "a\nb");
  assert.strictEqual(run("jsonPretty", '{"a":[1]}'), '{\n  "a": [\n    1\n  ]\n}');
  assert.strictEqual(run("jsonMin", '{ "a" : 1 }'), '{"a":1}');
  assert.strictEqual(run("jsonPretty", "{bad"), null);
  assert.strictEqual(run("b64decode", run("b64encode", "héllo")), "héllo");
  assert.strictEqual(run("urlDecode", run("urlEncode", "a b&c")), "a b&c");
  assert.strictEqual(run("nope", "x"), null);
});
test("case actions keep letters from any script (#251)", () => {
  assert.strictEqual(run("camel", "தமிழ் பெயர்"), "தமிழ்பெயர்");
  assert.strictEqual(run("snake", "தமிழ் பெயர்"), "தமிழ்_பெயர்");
  assert.strictEqual(run("kebab", "தமிழ் பெயர்"), "தமிழ்-பெயர்");
  assert.strictEqual(run("camel", "école déjà vu"), "écoleDéjàVu");
  assert.strictEqual(run("snake", "ÉcoleDéjà"), "école_déjà");
  // combining marks stay with their letter: e + U+0301
  assert.strictEqual(run("kebab", "Café Noir"), "café-noir");
  assert.strictEqual(run("camel", "привет мир"), "приветМир");
});
test("a case action that would clear the text is not offered (#251)", () => {
  const ids = available("!!! ??? ...").map(a => a.id);
  for (const id of ["camel", "snake", "kebab"]) {
    assert.ok(!ids.includes(id), id);
    assert.strictEqual(run(id, "!!! ??? ..."), null);
  }
  for (const t of ["தமிழ் பெயர்", "école déjà vu", "user profile id"])
    for (const id of ["camel", "snake", "kebab"]) { const r = run(id, t); assert.ok(r === null || r.length > 0, id + " " + t); }
});
test("formatting JSON never changes a number (#252)", () => {
  assert.strictEqual(run("jsonMin", '{"id": 9007199254740993}'), '{"id":9007199254740993}');
  assert.strictEqual(run("jsonPretty", '{"id":9007199254740993}'), '{\n  "id": 9007199254740993\n}');
  assert.strictEqual(run("jsonMin", '{"value": 1e400}'), '{"value":1e400}');
  // nested objects and arrays, and number spellings that JSON.parse would rewrite
  assert.strictEqual(run("jsonMin", '{ "a": [1.50, -0, 2E3, {"b": 123456789012345678901234567890}] }'),
    '{"a":[1.50,-0,2E3,{"b":123456789012345678901234567890}]}');
  assert.ok(available('{"id":9007199254740993}').some(a => a.id === "jsonPretty"));
  assert.strictEqual(run("jsonMin", '{"a": 1, "b": [true, null, "x"]}'), '{"a":1,"b":[true,null,"x"]}');
  assert.strictEqual(run("jsonMin", '[1, 2'), null);
});
