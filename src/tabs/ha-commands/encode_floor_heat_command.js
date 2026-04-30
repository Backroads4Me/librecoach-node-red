// Encodes FLOOR_HEAT_COMMAND messages (1FEFB)

// --- Configuration ---
const SOURCE_ADDRESS = global.get("rvc_source_address") || 254;
const PRIORITY = 6;
const DGN = "1FEFB";

// --- Input Validation ---
const instance = msg.instance;
const command = msg.command;

if (typeof instance !== "number") {
  node.warn(`[encode_floor_heat_command] Invalid instance: ${instance}`);
  return null;
}

// --- Get Context ---
const levelMap = global.get("floorHeatLevelMap", "file");
const scheduleContextKey = `floorHeat_${instance}_ScheduleOn`;
const isScheduleOn = global.get(scheduleContextKey, "file") || false;

// Store and retrieve the last used non-store preset's rawValue
const lastPresetKey = `floorHeat_${instance}_LastRawSetpoint`;
const lastRawSetpoint = global.get(lastPresetKey, "file") || 0;

// Get the currently active preset name from the status flow
const currentPresetKey = `floorHeat_${instance}_CurrentPreset`;
const currentPresetName = global.get(currentPresetKey, "file") || "level_1";

if (!levelMap && command !== "OFF") {
  node.warn(
    "[encode_floor_heat_command] Floor heat level map not found. Levels must be discovered first.",
  );
  return null;
}

// Determine the raw value to send during mode changes (HEAT/AUTO)
let rawValueToSend;
const storeLevelInfo = levelMap?.["store"];

if (currentPresetName === "store" && storeLevelInfo) {
  rawValueToSend = storeLevelInfo.rawValue;
} else if (lastRawSetpoint > 0) {
  rawValueToSend = lastRawSetpoint;
} else if (levelMap?.["level_1"]?.rawValue) {
  rawValueToSend = levelMap["level_1"].rawValue;
} else {
  node.warn(
    "[encode_floor_heat_command] No valid setpoint available. Levels must be discovered first.",
  );
  return null;
}

// --- Build Payload ---
const dataBytes = new Array(8).fill(0xff);
dataBytes[0] = instance; // Byte 0: Instance

// --- Command Mapping ---
if (command === "OFF") {
  dataBytes[1] = 0xc0; // Byte 1: Command (Off)
  dataBytes[2] = 0x00; // Byte 2: Setpoint LSB
  dataBytes[3] = 0x00; // Byte 3: Setpoint MSB
  global.set(scheduleContextKey, false, "file");
} else if (command === "HEAT") {
  // HEAT command: Turn ON, force Schedule OFF (Manual Mode)
  dataBytes[1] = 0xc4; // Byte 1: Command (ON + Schedule OFF)
  dataBytes[2] = rawValueToSend & 0xff; // Byte 2: Setpoint LSB
  dataBytes[3] = (rawValueToSend >> 8) & 0xff; // Byte 3: Setpoint MSB
  global.set(scheduleContextKey, false, "file");
} else if (command === "AUTO") {
  // AUTO command: Turn ON, force Schedule ON (Automatic Mode)
  dataBytes[1] = 0xd7; // Byte 1: Command (ON + Schedule ON)
  dataBytes[2] = rawValueToSend & 0xff; // Byte 2: Setpoint LSB
  dataBytes[3] = (rawValueToSend >> 8) & 0xff; // Byte 3: Setpoint MSB
  global.set(scheduleContextKey, true, "file");
} else if (command === "SET_PRESET") {
  if (!levelMap) {
    node.error(
      "[encode_floor_heat_command] Cannot set preset, level map is missing.",
    );
    return null;
  }

  const presetName = msg.value;
  const normalizedPresetName =
    presetName === "none" || !presetName ? "store" : presetName;
  const levelInfo = levelMap[normalizedPresetName];

  if (!levelInfo || typeof levelInfo.rawValue === "undefined") {
    node.warn(`[encode_floor_heat_command] Unknown preset name: ${presetName}`);
    return null;
  }

  const rawValue = levelInfo.rawValue;
  dataBytes[1] = isScheduleOn ? 0xd4 : 0xc4; // Byte 1: Command (maintain schedule state)
  dataBytes[2] = rawValue & 0xff; // Byte 2: Setpoint LSB
  dataBytes[3] = (rawValue >> 8) & 0xff; // Byte 3: Setpoint MSB

  // Update last non-store setpoint
  if (normalizedPresetName !== "store") {
    global.set(lastPresetKey, rawValue, "file");
  }
} else {
  node.warn(`[encode_floor_heat_command] Invalid command: "${command}"`);
  return null;
}

const dataHex = dataBytes
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("");

// --- Construct CAN ID ---
const dgnInt = parseInt(DGN, 16);
const canIdInt = (PRIORITY << 26) | (dgnInt << 8) | SOURCE_ADDRESS;
const canIdHex = canIdInt.toString(16).padStart(8, "0");

// --- Send Message ---
node.send({
  topic: "can/send",
  payload: `${canIdHex.toUpperCase()}#${dataHex.toUpperCase()}`,
});

return null;
