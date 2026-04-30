// Encodes AC_LOAD_COMMAND messages (DGN 1FFBEh, §6.22.4)

const CMD_SET_LEVEL = 0x00;
const CMD_ON = 0x01;
const CMD_OFF = 0x03;
const CMD_STOP = 0x04;
const CMD_UNLOCK = 0x22;
const LEVEL_FULL_ON = 200;
const NON_GROUP = 0xff;
const SOURCE_ADDRESS = global.get("rvc_source_address") || 254;
const PRIORITY = 6;
const DGN = "1FFBE";

const instance = msg.instance;

if (typeof instance !== "number" || instance < 1 || instance > 250) {
  node.warn(`[encode_ac_load_command] Invalid instance: ${instance}`);
  return null;
}

// Parse command — JSON schema: msg.payload is always an object
const command = msg.payload.state;
const brightness = msg.payload.brightness;

const dimmableAcLoads = global.get("dimmableAcLoads", "file") || [];
const isDimmable = dimmableAcLoads.includes(instance);

let commandCode, desiredLevel;

if (command === "OFF") {
  commandCode = CMD_OFF;
  desiredLevel = 0;
} else if (command === "ON" && brightness !== undefined && brightness > 0) {
  commandCode = CMD_SET_LEVEL;
  desiredLevel = Math.round(brightness * 2);
} else if (isDimmable) {
  const lastBrightness =
    global.get("acLoadBrightness_" + instance, "file") || 100;
  commandCode = CMD_SET_LEVEL;
  desiredLevel = Math.round(lastBrightness * 2);
} else {
  commandCode = CMD_ON;
  desiredLevel = LEVEL_FULL_ON;
}

function buildCanMessage(inst, level, cmd) {
  const dataBytes = new Array(8).fill(0xff);
  dataBytes[0] = inst; // Byte 0: Instance
  dataBytes[1] = NON_GROUP; // Byte 1: Group
  dataBytes[2] = level; // Byte 2: Desired Level
  dataBytes[3] = 0xff; // Byte 3: Mode/Interlock/Priority (no change)
  dataBytes[4] = cmd; // Byte 4: Command
  dataBytes[5] = 0xff; // Byte 5: Delay/Duration
  dataBytes[6] = 0xff; // Byte 6: Reserved
  dataBytes[7] = 0xff; // Byte 7: Reserved

  const dataHex = dataBytes
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  const dgnInt = parseInt(DGN, 16);
  const canIdInt = (PRIORITY << 26) | (dgnInt << 8) | SOURCE_ADDRESS;
  const canIdHex = canIdInt.toString(16).padStart(8, "0");

  return `${canIdHex.toUpperCase()}#${dataHex.toUpperCase()}`;
}

// Store last brightness for dimmable recall
if (brightness !== undefined && brightness > 0) {
  global.set("acLoadBrightness_" + instance, brightness, "file");
}

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

return null;
