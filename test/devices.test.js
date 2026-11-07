const test = require("node:test");
const assert = require("node:assert");
const { parse, newlyLow } = require("../src/devices");

test("devices: parse keeps one valid entry per name, lowest battery first", () => {
  const out = JSON.stringify([
    { name: "WH-1000XM4", battery: 80 }, { name: "WH-1000XM4", battery: 70 },
    { name: "MX Master 3", battery: 15 }, { name: "", battery: 50 }, { name: "Bad", battery: 140 }, { name: "None" },
  ]);
  assert.deepStrictEqual(parse(out), [{ name: "MX Master 3", battery: 15 }, { name: "WH-1000XM4", battery: 70 }]);
});

test("devices: parse copes with one object, nothing and garbage", () => {
  assert.deepStrictEqual(parse('{"name":"Buds","battery":42}'), [{ name: "Buds", battery: 42 }]);
  assert.deepStrictEqual(parse(""), []);
  assert.deepStrictEqual(parse("[]"), []);
  assert.deepStrictEqual(parse("WARNING: oops"), []);
});

test("devices: a low battery is warned about once until it charges again", () => {
  const warned = new Set();
  assert.deepStrictEqual(newlyLow([{ name: "Mouse", battery: 18 }, { name: "Buds", battery: 60 }], warned).map(d => d.name), ["Mouse"]);
  assert.deepStrictEqual(newlyLow([{ name: "Mouse", battery: 12 }], warned), []);
  assert.deepStrictEqual(newlyLow([{ name: "Mouse", battery: 90 }], warned), []);
  assert.deepStrictEqual(newlyLow([{ name: "Mouse", battery: 20 }], warned).map(d => d.name), ["Mouse"]);
});
