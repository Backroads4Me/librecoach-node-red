// Optimistic MicroAir State Update
// Input: Encoded bridge command from microair_encode_command.js
// Output 1: Optimistic HA state update (MQTT out to HA state topic)
// Output 2: Original bridge command passthrough (MQTT out to bridge /set topic)
//
// Merges pending changes into cached zone state and publishes
// immediately so the HA UI updates without waiting for the next poll cycle.

const command = msg.payload;
if (
  !command ||
  (command.Type !== "Change" && command.Type !== "Revert") ||
  !command.Changes
)
  return [null, msg];

const changes = command.Changes;
const zone = changes.zone;

// Extract MAC from the bridge topic: librecoach/ble/microair/{mac}/set
const topicParts = msg.topic.split("/");
if (topicParts.length < 5) return [null, msg];

const mac = topicParts[3];
const safeMac = mac.replace(/:/g, "_");

// Read cached state (memory holds the latest optimistic state; the file
// store is refreshed by microair_decode_status.js on each BLE poll)
const cached =
  global.get(`microair_${safeMac}_zone_${zone}`) ||
  global.get(`microair_${safeMac}_zone_${zone}`, "file");

// Revert: microair_encode_command rejected an invalid command — republish
// the cached state so the HA UI snaps back, and send nothing to the bridge.
if (command.Type === "Revert") {
  if (!cached) return [null, null];
  return [
    {
      topic: `librecoach/ble/microair/${mac}/zone/${zone}/state`,
      payload: JSON.stringify(cached),
    },
    null,
  ];
}

if (!cached) {
  // No cached state yet — can't build optimistic update, just forward command
  return [null, msg];
}

// Build optimistic state by merging changes into cached state
const optimistic = Object.assign({}, cached);

// Mode changes
if ("mode" in changes) {
  optimistic.mode_num = changes.mode;
  // Map numeric mode to string mode
  const MODE_NUM_TO_MODE = {
    0: "off",
    1: "fan_only",
    2: "cool",
    3: "heat",
    4: "heat",
    5: "heat",
    6: "off",
    7: "heat",
    8: "auto",
    9: "auto",
    10: "auto",
    11: "auto",
    12: "heat",
  };
  optimistic.mode = MODE_NUM_TO_MODE[changes.mode] || "off";

  // Update heat_source for preset state reporting
  const HEAT_TYPE_REVERSE = {
    5: "Heat Pump",
    4: "Furnace",
    3: "Gas Furnace",
    7: "Heat Strip",
    12: "Electric Heat",
  };
  if (changes.mode in HEAT_TYPE_REVERSE) {
    optimistic.heat_source = HEAT_TYPE_REVERSE[changes.mode];
    // Persist last-used heat mode so it survives off/on cycles
    global.set(
      `microair_${safeMac}_zone_${zone}_lastheat`,
      changes.mode,
      "file",
    );
  } else {
    // Preset (heat_source) only applies in heat mode — drop it so the HA
    // preset selector reads "none" in every other HVAC mode
    delete optimistic.heat_source;
  }
}

// Setpoint changes
if ("cool_sp" in changes) optimistic.cool_sp = changes.cool_sp;
if ("heat_sp" in changes) optimistic.heat_sp = changes.heat_sp;
if ("autoCool_sp" in changes) optimistic.autoCool_sp = changes.autoCool_sp;
if ("autoHeat_sp" in changes) optimistic.autoHeat_sp = changes.autoHeat_sp;

// Fan changes — update the correct fan field
if ("fanOnly" in changes) optimistic.fan_mode_num = changes.fanOnly;
if ("coolFan" in changes) optimistic.cool_fan_mode_num = changes.coolFan;
if ("gasFan" in changes) optimistic.furnace_fan_mode_num = changes.gasFan;
if ("eleFan" in changes) optimistic.heat_fan_mode_num = changes.eleFan;
if ("autoFan" in changes) optimistic.auto_fan_mode_num = changes.autoFan;

// Canonical protocol fan map (must match decode/encode/discovery):
// 0 = Off (fan-only and furnace modes);
// 2 = Manual High (not medium); 3 = top speed on 3-speed units.
const FAN_MODE_MAP = {
  0: "off",
  1: "low",
  2: "high",
  3: "high",
  65: "Cycled Low",
  66: "Cycled High",
  128: "auto",
};
const GAS_HEAT_MODES = [3, 4, 13];
const mode = optimistic.mode || "off";
let fanNum = 0;
if (mode === "fan_only") fanNum = optimistic.fan_mode_num ?? 0;
else if (mode === "cool") fanNum = optimistic.cool_fan_mode_num ?? 0;
else if (mode === "heat")
  // 0 is a valid value (off), so pick the field by heat type, not truthiness
  fanNum = GAS_HEAT_MODES.includes(optimistic.mode_num)
    ? (optimistic.furnace_fan_mode_num ?? 0)
    : (optimistic.heat_fan_mode_num ?? 0);
else if (mode === "auto") fanNum = optimistic.auto_fan_mode_num ?? 0;
optimistic.fan_mode = FAN_MODE_MAP[fanNum] || "auto";
optimistic.fan_mode_num = fanNum;

// Power state
if ("power" in changes) {
  optimistic.on = changes.power === 1;
  optimistic.off = changes.power === 0;
}

// Update cache with optimistic state
global.set(`microair_${safeMac}_zone_${zone}`, optimistic);

// Output 1: Publish optimistic state to HA state topic
const haMsg = {
  topic: `librecoach/ble/microair/${mac}/zone/${zone}/state`,
  payload: JSON.stringify(optimistic),
};

// Output 2: Forward original command to bridge
const bridgeMsg = {
  topic: msg.topic,
  payload: msg.payload,
};

return [haMsg, bridgeMsg];
