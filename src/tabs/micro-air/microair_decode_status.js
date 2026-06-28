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

// --- Observe max fan speed (accumulate over time) ---
const maxSpeedKey = `microair_${safeMac}_zone_${zone}_maxfan`;
let prevMax = global.get(maxSpeedKey, "file") || 0;
const fanFields = [
  payload.fan_mode_num,
  payload.cool_fan_mode_num,
  payload.heat_fan_mode_num,
  payload.auto_fan_mode_num,
  payload.furnace_fan_mode_num,
];
let currentMax = prevMax;
for (const v of fanFields) {
  if (typeof v === "number" && v < 128 && v > currentMax) {
    currentMax = v;
  }
}
if (currentMax > prevMax) {
  global.set(maxSpeedKey, currentMax, "file");
}

// --- 1. Send standardized internal message ---
const standardizedMsg = {
  mac: mac,
  zone: zone,
  value: payload, // full original payload
  outdoor_temperature: payload.outdoorTemperature,
  max_fan_speed: currentMax,
  max_fan_changed: currentMax > prevMax,
};

const internalMsg = {
  topic: `librecoach/microair/${mac}/zone/${zone}`,
  payload: standardizedMsg,
};

// --- Remap fan_mode using the observed-speed-aware map ---
// The BLE add-on labels fan values with a fixed 3-speed map (2 = "medium"),
// but a 2-speed unit reports "high" as value 2. Recompute fan_mode here from
// the add-on-selected fan_mode_num so it matches the dynamic fan_modes list
// advertised by microair_create_climate.js (otherwise HA discards the update
// as an unknown fan mode and the UI stays stuck on the previous speed).
const FAN_MODE_MAP =
  currentMax >= 3
    ? { 0: "auto", 1: "low", 2: "medium", 3: "high", 128: "auto" } // 3-speed
    : { 0: "auto", 1: "low", 2: "high", 128: "auto" }; // 2-speed
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
