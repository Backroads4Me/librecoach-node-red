"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const decodeSource = fs.readFileSync(
  path.join(__dirname, "../src/tabs/victron/victron_decode_mqtt.js"),
  "utf8",
);

const runDecode = new Function("msg", "global", "flow", "node", decodeSource);

// Units the decoder cannot infer from the reference CSV come from its own
// override table, so the map only needs the paths this file drives directly.
function victronMap() {
  return new Map([
    [
      "vebus",
      new Map([
        ["/Ac/Out/L1/P", { unit: "W", type: "float", access: "R" }],
        ["/Ac/Out/L2/P", { unit: "W", type: "float", access: "R" }],
        ["/Dc/0/Current", { unit: "A DC", type: "float", access: "R" }],
        ["/Ac/Out/L1/V", { unit: "V AC", type: "float", access: "R" }],
      ]),
    ],
    [
      "system",
      new Map([
        ["/Dc/Battery/Soc", { unit: "%", type: "float", access: "R" }],
        [
          "/SystemState/State",
          { unit: "0=Off;9=Inverting", type: "int", access: "R" },
        ],
      ]),
    ],
  ]);
}

function harness() {
  const memory = new Map(
    Object.entries({
      victronEnabled: true,
      victronMap: victronMap(),
      victronDevices: {
        vebus_276: { productName: "MultiPlus-II", shortName: "multiplus_ii" },
        system_0: { productName: "Cerbo GX", shortName: "cerbo_gx" },
      },
      uniqueVictron: [],
    }),
  );
  const flowMemory = new Map();
  const sent = [];
  const global = {
    get: (key) => memory.get(key),
    set: (key, value) => memory.set(key, value),
  };
  const flow = {
    get: (key) => flowMemory.get(key),
    set: (key, value) => flowMemory.set(key, value),
  };
  const node = { status() {}, send: (m) => sent.push(m) };

  // Every path the decoder emits has to look already-announced, otherwise the
  // discovery gate forces a publish regardless of the deadband.
  function feed(topic, value) {
    sent.length = 0;
    const result = runDecode({ topic, payload: { value } }, global, flow, node);
    const emitted = (result ? [result] : []).concat(sent);
    const seen = memory.get("uniqueVictron");
    for (const msg of emitted) {
      const { service_type, instance, dbus_path } = msg.payload;
      const key = `${service_type}_${instance}_${dbus_path}`;
      if (!seen.includes(key)) seen.push(key);
    }
    return emitted;
  }

  return { feed };
}

const valueFor = (emitted, dbusPath) => {
  const match = emitted.find((m) => m.payload.dbus_path === dbusPath);
  return match ? match.payload.value : undefined;
};

test("power quantizes to a step proportional to the reading", () => {
  const { feed } = harness();

  // ~2% of the reading, snapped onto a 1/2/5 ladder so the published number
  // stays legible: 100 W at 3.7 kW, 20 W at 500 W.
  assert.equal(
    valueFor(feed("N/p/vebus/276/Ac/Out/L1/P", 3727.4), "/Ac/Out/L1/P"),
    3700,
  );
  assert.equal(
    valueFor(feed("N/p/vebus/276/Ac/Out/L2/P", 512.34), "/Ac/Out/L2/P"),
    520,
  );

  // Below ~250 W the 5 W floor takes over from the relative term, which is
  // where a coach at rest actually sits.
  const { feed: fresh } = harness();
  assert.equal(
    valueFor(fresh("N/p/vebus/276/Ac/Out/L1/P", 47.8), "/Ac/Out/L1/P"),
    50,
  );
});

test("readings that move less than the deadband are not republished", () => {
  const { feed } = harness();

  assert.equal(
    valueFor(feed("N/p/vebus/276/Dc/0/Current", 5.94), "/Dc/0/Current"),
    6,
  );
  // Step at 5.94 A is 0.5 A, so small wobble stays inside the band.
  assert.equal(feed("N/p/vebus/276/Dc/0/Current", 6.02).length, 0);
  assert.equal(feed("N/p/vebus/276/Dc/0/Current", 5.88).length, 0);
  assert.equal(feed("N/p/vebus/276/Dc/0/Current", 6.31).length, 0);
  // Clearing the band publishes again.
  assert.equal(
    valueFor(feed("N/p/vebus/276/Dc/0/Current", 6.6), "/Dc/0/Current"),
    6.5,
  );
});

test("the deadband is measured against the published value, not the last sample", () => {
  const { feed } = harness();

  // Line voltage quantizes to 1 V, so a reading sitting on the 122.5 boundary
  // would alternate between 122 and 123 forever if each sample were compared
  // against its predecessor rather than against what was last published.
  feed("N/p/vebus/276/Ac/Out/L1/V", 122.5);
  let republished = 0;
  for (let i = 0; i < 100; i += 1) {
    republished += feed(
      "N/p/vebus/276/Ac/Out/L1/V",
      122.5 + (i % 2 === 0 ? 0.02 : -0.02),
    ).length;
  }
  assert.equal(republished, 0);
});

test("a genuine step change propagates immediately", () => {
  const { feed } = harness();

  feed("N/p/vebus/276/Ac/Out/L1/P", 1810.4);
  const emitted = feed("N/p/vebus/276/Ac/Out/L1/P", 240.5);
  assert.equal(valueFor(emitted, "/Ac/Out/L1/P"), 240);
});

test("enumerations pass through unquantized", () => {
  const { feed } = harness();

  // Codes carried in the unit string are exact values; rounding one to a
  // measurement grid would invent a state that does not exist.
  assert.equal(
    valueFor(feed("N/p/system/0/SystemState/State", 9), "/SystemState/State"),
    9,
  );
  assert.equal(feed("N/p/system/0/SystemState/State", 9).length, 0);
  assert.equal(
    valueFor(feed("N/p/system/0/SystemState/State", 0), "/SystemState/State"),
    0,
  );
});

test("state of charge resolves to whole percent", () => {
  const { feed } = harness();

  assert.equal(
    valueFor(feed("N/p/system/0/Dc/Battery/Soc", 87.43), "/Dc/Battery/Soc"),
    87,
  );
  assert.equal(feed("N/p/system/0/Dc/Battery/Soc", 87.61).length, 0);
  assert.equal(
    valueFor(feed("N/p/system/0/Dc/Battery/Soc", 88.7), "/Dc/Battery/Soc"),
    89,
  );
});

test("derived totals carry the same deadband as measured values", () => {
  const { feed } = harness();

  feed("N/p/vebus/276/Ac/Out/L1/P", 1810.4);
  const first = feed("N/p/vebus/276/Ac/Out/L2/P", 1902.7);
  assert.equal(valueFor(first, "/Ac/Out/Total/P"), 3700);

  // The total is recomputed on both contributing paths. Gating it on the value
  // rather than on the trigger is what stops that fan-in from multiplying the
  // publish rate.
  let totals = 0;
  for (let i = 0; i < 50; i += 1) {
    totals += feed("N/p/vebus/276/Ac/Out/L1/P", 1810.4 + (i % 2)).filter(
      (m) => m.payload.dbus_path === "/Ac/Out/Total/P",
    ).length;
  }
  assert.equal(totals, 0);
});
