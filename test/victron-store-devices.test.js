"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(
  path.join(__dirname, "../src/tabs/victron/victron_store_devices.js"),
  "utf8",
);
const runNode = new Function("msg", "global", "node", source);

function harness(initial = {}) {
  const memory = new Map(Object.entries(initial));
  const global = {
    get(key) {
      return memory.get(key);
    },
    set(key, value) {
      memory.set(key, value);
    },
  };
  const node = { status() {} };
  return { global, memory, node };
}

test("device CustomName changes refresh every discovered entity", () => {
  const { global, memory, node } = harness({
    victronEnabled: true,
    victronDevices: {
      grid_30: {
        productName: "Energy Meter",
        shortName: "energy_meter",
        customName: "Old meter name",
      },
    },
    uniqueVictron: [
      "grid_30_/Ac/L1/Power",
      "grid_30_/Ac/Power",
      "battery_1_/Dc/0/Current",
    ],
  });

  const result = runNode(
    {
      topic: "N/portal-123/grid/30/CustomName",
      payload: { value: "Shore meter" },
    },
    global,
    node,
  );

  assert.deepEqual(result, [
    { reset: true },
    [
      {
        topic: "R/portal-123/grid/30/Ac/L1/Power",
        payload: "",
      },
      {
        topic: "R/portal-123/grid/30/Ac/Power",
        payload: "",
      },
    ],
  ]);
  assert.equal(memory.get("victronDevices").grid_30.customName, "Shore meter");
  assert.deepEqual(memory.get("uniqueVictron"), ["battery_1_/Dc/0/Current"]);
});

test("ProductName for an unseen device does not request a republish", () => {
  const { global, memory, node } = harness({
    victronEnabled: true,
    victronDevices: {},
  });

  const result = runNode(
    {
      topic: "N/portal-123/system/0/ProductName",
      payload: { value: "Cerbo GX" },
    },
    global,
    node,
  );

  assert.equal(result, null);
  assert.equal(memory.get("victronDevices").system_0.shortName, "cerbo_gx");
});

test("unchanged device CustomName does not request refreshes", () => {
  const { global, node } = harness({
    victronEnabled: true,
    victronDevices: {
      grid_30: { customName: "Shore meter" },
    },
    uniqueVictron: ["grid_30_/Ac/L1/Power"],
  });

  const result = runNode(
    {
      topic: "N/portal-123/grid/30/CustomName",
      payload: { value: "Shore meter" },
    },
    global,
    node,
  );

  assert.equal(result, null);
});
