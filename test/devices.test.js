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

test("devices: a reply from a stopped poll publishes nothing and leaves no timer (#197)", async () => {
  const devices = require("../src/devices");
  const calls = [];
  const exec = (_c, _a, _o, cb) => { calls.push(cb); return { kill() {} }; };
  const lists = [];
  devices.poll(l => lists.push(["A", l]), () => {}, exec);
  await new Promise(r => setTimeout(r, 5));
  devices.stop();
  devices.poll(l => lists.push(["B", l]), () => {}, exec);
  await new Promise(r => setTimeout(r, 5));
  assert.equal(calls.length, 2);
  calls[0](null, '[{"name":"Old","battery":5}]');
  calls[1](null, '[{"name":"New","battery":50}]');
  assert.deepEqual(lists, [["B", [{ name: "New", battery: 50 }]]]);
  devices.stop();
});
