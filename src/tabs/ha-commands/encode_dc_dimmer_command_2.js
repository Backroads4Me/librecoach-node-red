// Encodes DC_DIMMER_COMMAND_2 messages (1FEDB)

// --- Configuration ---
const CMD_SET_BRIGHTNESS = 0x00;
const CMD_ON = 0x01;
const CMD_OFF = 0x03;
const CMD_STOP = 0x04;
const CMD_RAMP_UP_DOWN = 0x15;
const CMD_UNLOCK = 0x22;
const LEVEL_FULL_ON = 200;
const NON_GROUP = 0xff;
const SOURCE_ADDRESS = global.get("rvc_source_address") || 254;
const PRIORITY = 6;
const DGN = "1FEDB";

// --- Input Validation ---
const instance = msg.instance;

if (typeof instance !== "number" || instance < 1 || instance > 250) {
  node.warn(`[encode_dc_dimmer_command_2] Invalid instance: ${instance}`);
  return null;
}

// --- Parse Command ---
// All lights use JSON schema: msg.payload is always an object
const command = msg.payload.state;
const brightness = msg.payload.brightness;

// Check if this is a dimmable light
const dimmableLights = global.get("dimmableLights", "file") || [];
const isDimmable = dimmableLights.includes(instance);

// --- Command Mapping ---
let commandCode, desiredLevel;

if (command === "OFF") {
  commandCode = CMD_OFF;
  desiredLevel = 0;
} else if (command === "ON" && brightness !== undefined && brightness > 0) {
  // Brightness command: map 0-100 to 0-200 RV-C scale
  commandCode = CMD_SET_BRIGHTNESS;
  desiredLevel = Math.round(brightness * 2);
} else if (isDimmable) {
  // Dimmable light toggled ON without brightness — recall last known level
  const lastBrightness =
    global.get("dimmerBrightness_" + instance, "file") || 100;
  commandCode = CMD_SET_BRIGHTNESS;
  desiredLevel = Math.round(lastBrightness * 2);
} else {
  // Non-dimmable light — full on
  commandCode = CMD_ON;
  desiredLevel = LEVEL_FULL_ON;
}

// --- Helper Functions ---
function buildCanMessage(instance, desiredLevel, commandCode) {
  const dataBytes = new Array(8).fill(0xff);
  dataBytes[0] = instance; // Byte 0: Instance
  dataBytes[1] = NON_GROUP; // Byte 1: Group (non-group)
  dataBytes[2] = desiredLevel; // Byte 2: Desired Level
  dataBytes[3] = commandCode; // Byte 3: Command
  dataBytes[4] = 0xff; // Byte 4: Delay/Duration
  dataBytes[5] = 0x00; // Byte 5: Interlock
  dataBytes[6] = 0xff; // Byte 6: Ramp Time
  dataBytes[7] = 0xff; // Byte 7: Reserved

  const dataHex = dataBytes
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  const dgnInt = parseInt(DGN, 16);
  const canIdInt = (PRIORITY << 26) | (dgnInt << 8) | SOURCE_ADDRESS;
  const canIdHex = canIdInt.toString(16).padStart(8, "0");

  return `${canIdHex.toUpperCase()}#${dataHex.toUpperCase()}`;
}

// --- Store last brightness for dimmable recall ---
if (brightness !== undefined && brightness > 0) {
  global.set("dimmerBrightness_" + instance, brightness, "file");
}

// --- Build and Send ---
// Message 1: UNLOCK
node.send({
  topic: "can/send",
  payload: buildCanMessage(instance, desiredLevel, CMD_UNLOCK),
});

// Message 2: Command
node.send({
  topic: "can/send",
  payload: buildCanMessage(instance, desiredLevel, commandCode),
});

// Messages 3-4: Save brightness to dimmer memory (dimmable lights only)
// After SET_BRIGHTNESS, send Ramp Up/Down + Stop to trigger memory save.
if (isDimmable && commandCode === CMD_SET_BRIGHTNESS && desiredLevel > 0) {
  node.send({
    topic: "can/send",
    payload: buildCanMessage(instance, 0, CMD_RAMP_UP_DOWN),
  });
  node.send({
    topic: "can/send",
    payload: buildCanMessage(instance, 0, CMD_STOP),
  });
}

return null;
