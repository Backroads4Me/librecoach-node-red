"use strict";

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert");

const decoderDir = path.join(
  __dirname,
  "..",
  "src",
  "tabs",
  "status-routing",
);

const zero16 = 32000; // 0x7D00
const zero32 = 2000000000; // 0x77359400

function extract(file, name) {
  const source = fs.readFileSync(path.join(decoderDir, file), "utf8");
  const pattern = new RegExp(`function ${name}\\s*\\([\\s\\S]*?\\n\\}`);
  const match = source.match(pattern);
  assert.ok(match, `${name} is present in ${file}`);
  return new Function(`${match[0]}; return ${name};`)();
}

function assertDecoded(actual, expected, message) {
  if (typeof expected === "number") {
    assert.equal(typeof actual, "number", message);
    assert.ok(Math.abs(actual - expected) < 0.001, message);
    return;
  }
  assert.equal(actual, expected, message);
}

// RV-C Table 5.3 amperage encodings and Table 3.2.3b special values.
const casesByWidth = {
  uint8: [
    [0, 0, "zero"],
    [10, 10, "10 A"],
    [250, 250, "maximum"],
    [251, "Invalid", "above maximum"],
    [252, "Invalid", "above maximum"],
    [253, "Reserved", "Reserved"],
    [254, "Out of Range", "Out of Range"],
    [255, "Not Available", "Not Available"],
  ],
  uint16: [
    [zero16, 0, "zero"],
    [zero16 + 400, 20, "+20 A"],
    [zero16 - 2000, -100, "-100 A"],
    [0, -1600, "minimum"],
    [64250, 1612.5, "maximum"],
    [64251, "Invalid", "above maximum"],
    [65533, "Reserved", "Reserved"],
    [65534, "Out of Range", "Out of Range"],
    [65535, "Not Available", "Not Available"],
  ],
  uint32: [
    [zero32, 0, "zero"],
    [zero32 + 25500, 25.5, "+25.5 A"],
    [zero32 - 100000, -100, "-100 A"],
    [0, -2000000, "minimum"],
    [0x80000000, 147483.648, "high bit set"],
    [4221081200, 2221081.2, "maximum"],
    [4294967293, "Reserved", "Reserved"],
    [4294967294, "Out of Range", "Out of Range"],
    [4294967295, "Not Available", "Not Available"],
  ],
};

const amperageTargets = [
  ["decode_dc_source_status.js", "decodeDCCurrent32bit", "uint32"],
  ["decode_inverter_dc_status.js", "decodeDCCurrent", "uint16"],
  ["decode_charger_status.js", "decodeDCCurrent", "uint16"],
  ["decode_ats_ac_status.js", "decodeACCurrent", "uint16"],
  ["decode_charger_ac_status.js", "decodeACCurrent", "uint16"],
  ["decode_inverter_ac_status.js", "decodeACCurrent", "uint16"],
  ["decode_generator_ac_status.js", "decodeACCurrent", "uint16"],
  ["decode_solar_controller.js", "decodeDCCurrentOffset", "uint16"],
  ["decode_ac_load_status.js", "decodeAmperage8", "uint8"],
  ["decode_ac_load_status.js", "decodeAmperage16", "uint16"],
  ["decode_dc_dimmer_status_3.js", "decodeAmperage8", "uint8"],
];

for (const [file, name, width] of amperageTargets) {
  test(`${file} ${name} follows the RV-C ${width} amperage encoding`, () => {
    const decode = extract(file, name);
    for (const [raw, expected, label] of casesByWidth[width]) {
      assertDecoded(decode(raw), expected, `${file} ${name}: ${label}`);
    }
  });
}

test("DC_SOURCE_STATUS_1 reconstructs unsigned 32-bit current", () => {
  const source = fs.readFileSync(
    path.join(decoderDir, "decode_dc_source_status.js"),
    "utf8",
  );
  const match = source.match(/const current =[\s\S]*?;/);
  assert.ok(match, "current reconstruction is present");

  const reconstruct = new Function("data", `${match[0]} return current;`);
  const decode = extract(
    "decode_dc_source_status.js",
    "decodeDCCurrent32bit",
  );
  const frameCases = [
    [zero32, 0, "zero"],
    [zero32 + 25500, 25.5, "+25.5 A"],
    [0x80000000, 147483.648, "high bit set"],
    [4221081200, 2221081.2, "maximum"],
    [4294967293, "Reserved", "Reserved"],
    [4294967294, "Out of Range", "Out of Range"],
    [4294967295, "Not Available", "Not Available"],
  ];

  for (const [raw, expected, label] of frameCases) {
    const data = [
      1,
      0xff,
      0,
      0,
      raw & 0xff,
      (raw >>> 8) & 0xff,
      (raw >>> 16) & 0xff,
      (raw >>> 24) & 0xff,
    ];
    assertDecoded(decode(reconstruct(data)), expected, label);
  }
});

test("amperage helpers use offset encoding", () => {
  const helperPattern =
    /function \w*(?:Current|Amperage)\w*\([^)]*\)\s*\{([\s\S]*?)\n\}/g;

  for (const file of fs
    .readdirSync(decoderDir)
    .filter((name) => name.startsWith("decode_"))) {
    const source = fs.readFileSync(path.join(decoderDir, file), "utf8");
    let match;
    while ((match = helperPattern.exec(source))) {
      if (/Schedule|Instance/.test(match[0])) continue;
      const body = match[1];
      assert.equal(
        body.includes("4294967296") || body.includes("2147483647"),
        false,
        `${file} does not apply two's-complement conversion to amperage`,
      );
      if (/\*\s*0\.05\b/.test(body)) {
        assert.ok(
          body.includes("1600"),
          `${file} applies the -1600 A offset with 0.05 A/bit`,
        );
      }
    }
  }
});

for (const [file, name] of [
  ["decode_dc_source_status.js", "decodeTemperature"],
  ["decode_thermostat_ambient_status.js", "decodeTemp16"],
  ["decode_thermostat_status_1.js", "decodeTemp16"],
]) {
  test(`${file} ${name} follows the RV-C uint16 temperature encoding`, () => {
    const decode = extract(file, name);
    const raw = 9416;
    let actual;
    try {
      actual = decode(raw, true);
    } catch {
      actual = undefined;
    }
    if (typeof actual !== "number") actual = decode(raw);

    const celsius = actual > 50 ? ((actual - 32) * 5) / 9 : actual;
    const expected = raw * 0.03125 - 273;
    assert.ok(
      Math.abs(celsius - expected) <= 0.06,
      `${file} ${name}: expected approximately ${expected} C, got ${actual}`,
    );
  });
}

test("standard special-value labels follow RV-C Table 3.2.3b", () => {
  const expectedByRaw = {
    255: "Not Available",
    254: "Out of Range",
    253: "Reserved",
    65535: "Not Available",
    65534: "Out of Range",
    65533: "Reserved",
    4294967295: "Not Available",
    4294967294: "Out of Range",
    4294967293: "Reserved",
  };
  const standardLabels = new Set([
    "Not Available",
    "Out of Range",
    "Reserved",
  ]);
  const pattern =
    /===\s*(\d{3,10})\s*\)\s*\{?\s*(?:return\s+)?"([^"]+)"/g;

  for (const file of fs
    .readdirSync(decoderDir)
    .filter((name) => name.endsWith(".js"))) {
    const source = fs.readFileSync(path.join(decoderDir, file), "utf8");
    let match;
    while ((match = pattern.exec(source))) {
      const raw = Number(match[1]);
      const label = match[2];
      if (!(raw in expectedByRaw) || !standardLabels.has(label)) continue;
      assert.equal(
        label,
        expectedByRaw[raw],
        `${file}: raw ${raw} has the correct standard label`,
      );
    }
  }
});
