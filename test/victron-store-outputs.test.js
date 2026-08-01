"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(
  path.join(__dirname, "../src/tabs/victron/victron_store_outputs.js"),
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

test("relay CustomName changes request state and invalidate discovery", () => {
  const { global, memory, node } = harness({
    victronEnabled: true,
    victronOutputs: {
      system_0_1: { func: 2, customName: "Old name" },
    },
    victronDevices: {
      system_0: { shortName: "system" },
    },
    uniqueVictron: ["system_0_/SwitchableOutput/1/State"],
    victron_victron_system_0_relay_1_state_dsig: "old-signature",
  });

  const result = runNode(
    {
      topic: "N/portal-123/system/0/SwitchableOutput/1/Settings/CustomName",
      payload: { value: "Bedroom fan" },
    },
    global,
    node,
  );

  assert.deepEqual(result, [
    null,
    { reset: true },
    {
      topic: "R/portal-123/system/0/SwitchableOutput/1/State",
      payload: "",
    },
  ]);
  assert.equal(
    memory.get("victronOutputs").system_0_1.customName,
    "Bedroom fan",
  );
  assert.deepEqual(memory.get("uniqueVictron"), []);
  assert.equal(
    memory.get("victron_victron_system_0_relay_1_state_dsig"),
    undefined,
  );
});

test("unchanged relay CustomName does not request another refresh", () => {
  const { global, node } = harness({
    victronEnabled: true,
    victronOutputs: {
      system_0_1: { func: 2, customName: "Bedroom fan" },
    },
  });

  const result = runNode(
    {
      topic: "N/portal-123/system/0/SwitchableOutput/1/Settings/CustomName",
      payload: { value: "Bedroom fan" },
    },
    global,
    node,
  );

  assert.equal(result, null);
});
