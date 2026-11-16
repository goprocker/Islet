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
