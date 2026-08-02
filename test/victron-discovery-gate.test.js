"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const decodeSource = fs.readFileSync(
  path.join(__dirname, "../src/tabs/victron/victron_decode_mqtt.js"),
  "utf8",
);
const storeSource = fs.readFileSync(
  path.join(__dirname, "../src/tabs/victron/victron_store_devices.js"),
  "utf8",
);
const statusSource = fs.readFileSync(
  path.join(__dirname, "../src/tabs/victron/victron_status.js"),
  "utf8",
);

const runDecode = new Function("msg", "global", "flow", "node", decodeSource);
const runStore = new Function("msg", "global", "node", storeSource);
const runStatus = new Function(
  "msg",
  "global",
  "context",
  "node",
  statusSource,
);

// The decoder only needs the battery voltage definition; everything else on the
// system service falls back to the decoder's own unit overrides.
function victronMap() {
  return new Map([
    [
      "system",
      new Map([
        ["/Dc/Battery/Voltage", { unit: "V DC", type: "float", access: "R" }],
      ]),
    ],
  ]);
}

function harness(initial = {}) {
  const memory = new Map(
    Object.entries({
      victronEnabled: true,
      victronMap: victronMap(),
      ...initial,
    }),
  );
  const flowMemory = new Map();
  const global = {
    get: (key) => memory.get(key),
    set: (key, value) => memory.set(key, value),
  };
  const flow = {
    get: (key) => flowMemory.get(key),
    set: (key, value) => flowMemory.set(key, value),
  };
  const context = {
    get: (key) => flowMemory.get(key),
    set: (key, value) => flowMemory.set(key, value),
  };
  const node = { status() {}, send() {} };
  return { global, flow, context, node, memory };
}

const voltageMsg = () => ({
  topic: "N/portal-123/system/0/Dc/Battery/Voltage",
  payload: { value: 13.4 },
});

test("values are held back until a ProductName-derived shortName exists", () => {
  const { global, flow, node } = harness({
    victronDevices: { system_0: { customName: "House system" } },
  });

  assert.equal(runDecode(voltageMsg(), global, flow, node), null);
});

test("values decode once the device has a shortName", () => {
  const { global, flow, node } = harness({
    victronDevices: {
      system_0: { productName: "Cerbo GX", shortName: "cerbo", customName: "" },
    },
  });

  const result = runDecode(voltageMsg(), global, flow, node);
  assert.equal(result.payload.service_type, "system");
  assert.equal(result.payload.dbus_path, "/Dc/Battery/Voltage");
  assert.equal(result.payload.value, 13.4);
});

test("CustomName before value before ProductName still yields matching topics", () => {
  const { global, flow, context, node } = harness({ victronDevices: {} });

  // 1. CustomName arrives first and creates a device entry with no shortName.
  runStore(
    {
      topic: "N/portal-123/system/0/CustomName",
      payload: { value: "House system" },
    },
    global,
    node,
  );

  // 2. The value is dropped rather than published under the service-type
  //    fallback, which would leave HA with a victron_system_0_* entity.
  assert.equal(runDecode(voltageMsg(), global, flow, node), null);

  // 3. ProductName completes the device and asks Venus to republish.
  const storeResult = runStore(
    {
      topic: "N/portal-123/system/0/ProductName",
      payload: { value: "Cerbo GX" },
    },
    global,
    node,
  );
  assert.deepEqual(storeResult, [
    { reset: true },
    { topic: "R/portal-123/keepalive", payload: "" },
  ]);

  // 4. The republished value now carries the ProductName-derived entity id, and
  //    state lands on the topic discovery announced.
  const decoded = runDecode(voltageMsg(), global, flow, node);
  assert.notEqual(decoded, null);

  const status = runStatus(decoded, global, context, node);
  assert.equal(
    status.topic,
    "homeassistant/sensor/victron_cerbo_gx_0_dc_battery_voltage/state",
  );
});
