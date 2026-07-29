"use strict";

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert");

const decoderDir = path.join(__dirname, "..", "src", "tabs", "status-routing");

function run(file, payload) {
  const body = fs.readFileSync(path.join(decoderDir, file), "utf8");
  const decode = new Function("msg", "node", body);
  const msg = { payload: { ...payload } };
  const node = {
    warn(message) { throw new Error(message); },
    error(message) { throw new Error(message); },
    debug() {},
  };
  return decode(msg, node)?.payload;
}

const boundedPercentages = [
  {
    name: "AC load operating level",
    file: "decode_ac_load_status.js",
    dgn: "1FFBF",
    payload: (raw) => `01FF${raw}00FFFFFFFF`,
    field: "operating_level",
  },
  {
    name: "air conditioner fan and output levels",
    file: "decode_air_conditioner_status.js",
    dgn: "1FFE1",
    payload: (raw) => `0100${raw}${raw}${raw}${raw}`,
    field: "max_fan_speed",
  },
  {
    name: "DC dimmer brightness",
    file: "decode_dc_dimmer_status_3.js",
    dgn: "1FFBB",
    payload: (raw) => `01${raw}${raw}${raw}${raw}00${raw}`,
    field: "master_brightness",
  },
  {
    name: "DC dimmer operating status",
    file: "decode_dc_dimmer_status_3.js",
    dgn: "1FEDA",
    payload: (raw) => `01FF${raw}0000010000`,
    field: "operating_status",
  },
  {
    name: "DC load operating status",
    file: "decode_dc_load_status.js",
    dgn: "1FFBD",
    payload: (raw) => `01FF${raw}00FFFFFFFF`,
    field: "operating_status",
  },
  {
    name: "DC source state of charge",
    file: "decode_dc_source_status.js",
    dgn: "1FFFC",
    payload: (raw) => `01000000${raw}000000`,
    field: "state_of_charge_percent",
  },
  {
    name: "DC source state of health",
    file: "decode_dc_source_status.js",
    dgn: "1FFFB",
    payload: (raw) => `0100${raw}0000${raw}0000`,
    field: "state_of_health_percent",
  },
  {
    name: "DC source relative capacity",
    file: "decode_dc_source_status.js",
    dgn: "1FFFB",
    payload: (raw) => `0100${raw}0000${raw}0000`,
    field: "relative_capacity_percent",
  },
  {
    name: "lock position",
    file: "decode_lock_status.js",
    dgn: "1FEE5",
    payload: (raw) => `010000${raw}0000`,
    field: "position",
  },
  {
    name: "window shade motor duty",
    file: "decode_window_shade_control_status.js",
    dgn: "1FEDE",
    payload: (raw) => `01FF${raw}00000100`,
    field: "operating_status",
  },
];

for (const item of boundedPercentages) {
  test(`${item.name} is bounded at the DGN's 100% value`, () => {
    const atFull = run(item.file, {
      dgn: item.dgn,
      data_payload: item.payload("C8"),
    });
    const aboveFull = run(item.file, {
      dgn: item.dgn,
      data_payload: item.payload("C9"),
    });
    assert.equal(atFull[item.field], 100);
    assert.notEqual(typeof aboveFull[item.field], "number");
  });
}

test("DC component driver PWM uses its explicit raw 0-200 range", () => {
  const base = {
    dgn: "16300",
    dgn_name: "DC_COMPONENT_DRIVER_STATUS_6",
  };
  const atFull = run("decode_dc_driver_status.js", {
    ...base, data_payload: "010100C800000000",
  });
  const aboveFull = run("decode_dc_driver_status.js", {
    ...base, data_payload: "010100C900000000",
  });
  assert.equal(atFull.pwm_duty_cycle, 100);
  assert.equal("pwm_duty_cycle" in aboveFull, false);
});

for (const item of [
  ["ATS AC", "decode_ats_ac_status.js", "1FEA7", "FA00000000000000"],
  ["inverter", "decode_inverter_dc_status.js", "1FF8D", "FA0000000000"],
  ["thermostat", "decode_thermostat_status_2.js", "1FEE0", "FAFAFA00"],
]) {
  test(`${item[0]} instance fields retain the uint8 1-250 range`, () => {
    const decoded = run(item[1], { dgn: item[2], data_payload: item[3] });
    assert.equal(decoded.instance, 250);
  });
}
