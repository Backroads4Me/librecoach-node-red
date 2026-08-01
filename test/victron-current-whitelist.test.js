"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

function objectInitializer(source, declaration) {
  const declarationIndex = source.indexOf(`const ${declaration} =`);
  assert.notEqual(
    declarationIndex,
    -1,
    `${declaration} declaration is present`,
  );
  const start = source.indexOf("{", declarationIndex);
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) {
      return Function(`return (${source.slice(start, index + 1)})`)();
    }
  }
  throw new Error(`${declaration} initializer is incomplete`);
}

const decoderSource = fs.readFileSync(
  path.join(__dirname, "../src/tabs/victron/victron_decode_mqtt.js"),
  "utf8",
);
const createSource = fs.readFileSync(
  path.join(__dirname, "../src/tabs/victron/victron_create.js"),
  "utf8",
);

const expectedCurrentPaths = {
  system: ["/Dc/Vebus/Current", "/Dc/InverterCharger/Current"],
  solarcharger: ["/Pv/I"],
  charger: ["/Dc/1/Current", "/Dc/2/Current", "/Ac/In/L1/I"],
  grid: ["/Ac/L1/Current", "/Ac/L2/Current", "/Ac/L3/Current"],
  acload: ["/Ac/L1/Current", "/Ac/L2/Current", "/Ac/L3/Current"],
  vebus: ["/Ac/ActiveIn/L3/I", "/Ac/Out/L3/I"],
};

test("supported Victron measured-current paths are whitelisted and named", () => {
  const whitelist = objectInitializer(decoderSource, "pathWhitelist");
  const friendlyNames = objectInitializer(createSource, "friendlyNameMap");

  for (const [service, paths] of Object.entries(expectedCurrentPaths)) {
    for (const dbusPath of paths) {
      assert.ok(
        whitelist[service].includes(dbusPath),
        `${service}:${dbusPath} is whitelisted`,
      );
      assert.ok(
        friendlyNames[`${service}:${dbusPath}`],
        `${service}:${dbusPath} has a friendly name`,
      );
    }
  }
});
