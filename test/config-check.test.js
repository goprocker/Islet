const test = require("node:test");
const assert = require("node:assert");
const { checkConfig } = require("../src/config-check");

const DEFAULTS = { userName: "", customPet: "" };

test("a userName that isn't text falls back to the default and is reported (#200)", () => {
  for (const bad of [42, true, ["a"], { a: 1 }, null]) {
    const { config, invalid } = checkConfig({ userName: bad, customPet: bad }, DEFAULTS);
    assert.strictEqual(config.userName, "");
    assert.strictEqual(config.customPet, "");
    assert.deepStrictEqual(invalid.sort(), ["customPet", "userName"]);
  }
});

test("a text userName is kept", () => {
  const { config, invalid } = checkConfig({ userName: "Gopi", customPet: "clawd" }, DEFAULTS);
  assert.strictEqual(config.userName, "Gopi");
  assert.strictEqual(config.customPet, "clawd");
  assert.deepStrictEqual(invalid, []);
});
