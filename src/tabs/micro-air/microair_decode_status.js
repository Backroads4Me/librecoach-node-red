// Decode MicroAir Status
// Topic: librecoach/ble/microair/{mac}/state

const topic = msg.topic;
if (!topic) return null;

// Drop incoming BLE data if the integration is disabled
if (global.get("microairEnabled") === false) {
  return null;
}

const parts = topic.split("/");
// Expecting: librecoach/ble/microair/{mac}/state
if (parts.length < 5) return null;

const mac = parts[3];
const payload = msg.payload;

if (!payload || typeof payload !== "object") return null;

const zone = payload.zone;
if (zone === undefined) return null;

// --- Cache zone state for command encoding ---
const safeMac = mac.replace(/:/g, "_");
global.set(`microair_${safeMac}_zone_${zone}`, payload, "file");

// --- Persist last-used heat mode so it survives off/on cycles ---
const HEAT_MODES = [3, 4, 5, 7, 12];
if (HEAT_MODES.includes(payload.mode_num)) {
  global.set(
    `microair_${safeMac}_zone_${zone}_lastheat`,
    payload.mode_num,
    "file",
  );
}

// --- 1. Send standardized internal message ---
const standardizedMsg = {
  mac: mac,
  zone: zone,
  value: payload, // full original payload
  outdoor_temperature: payload.outdoorTemperature,
};

const internalMsg = {
  topic: `librecoach/microair/${mac}/zone/${zone}`,
  payload: standardizedMsg,
};

// --- Remap fan_mode using the canonical protocol map ---
// Recompute fan_mode from the add-on-selected fan_mode_num so the label
// always matches the fixed fan_modes list advertised by
// microair_create_climate.js (otherwise HA discards the update as an
// unknown fan mode and the UI stays stuck on the previous speed).
// 2 = Manual High (not medium); 3 = top speed on 3-speed units.
const FAN_MODE_MAP = {
  0: "auto",
  1: "low",
  2: "high",
  3: "high",
  65: "Cycled Low",
  66: "Cycled High",
  128: "auto",
};
if (typeof payload.fan_mode_num === "number") {
  payload.fan_mode = FAN_MODE_MAP[payload.fan_mode_num] || "auto";
}

// --- 2. Send original payload to per-zone HA state topic (stringified) ---
const haStateMsg = {
  topic: `librecoach/ble/microair/${mac}/zone/${zone}/state`,
  payload: JSON.stringify(payload), // <--- critical fix
};

// Return both messages
return [haStateMsg, internalMsg];
