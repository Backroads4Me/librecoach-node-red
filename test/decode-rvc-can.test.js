"use strict";

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert");

const body = fs.readFileSync(path.join(
  __dirname, "..", "src", "tabs", "config", "decode_rvc_can.js"
), "utf8");
const decode = new Function("msg", "node", "global", "flow", body);

function run(payload) {
  const msg = { payload };
  const node = {
    warn(message) { throw new Error(message); },
    error(message) { throw new Error(message); },
  };
  const dgnMap = new Map([
    ["1FECA", "DM_RV"],
    ["1FEDB", "DC_DIMMER_COMMAND_2"],
  ]);
  return decode(msg, node, { get: () => dgnMap }, {});
}

test("data-page-zero FECA is J1939 DM1, not RV-C DM_RV", () => {
  const result = run("18FECA21#14FF60000403FFFF");
  assert.equal(result.payload.dgn, "0FECA");
  assert.equal(result.payload.dgn_name, "J1939_DM1");
});

test("data-page-one FECA remains RV-C DM_RV", () => {
  const result = run("19FECA21#0045000C0401FF0F");
  assert.equal(result.payload.dgn, "1FECA");
  assert.equal(result.payload.dgn_name, "DM_RV");
});

test("the ordinary data-page fallback remains available", () => {
  const result = run("18FEDB21#09FFC822FF00FFFF");
  assert.equal(result.payload.dgn, "1FEDB");
  assert.equal(result.payload.dgn_name, "DC_DIMMER_COMMAND_2");
});
