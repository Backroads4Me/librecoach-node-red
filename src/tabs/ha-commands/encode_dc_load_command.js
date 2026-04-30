// Encodes DC_LOAD_COMMAND messages (DGN 1FFBCh, §6.23.4)

// --- Configuration ---
const SOURCE_ADDRESS = global.get("rvc_source_address") || 254;
const PRIORITY = 6;
const CMD_SET_LEVEL = 0x00;
const CMD_ON = 0x01;
const CMD_OFF = 0x03;
const CMD_STOP = 0x04;
const CMD_UNLOCK = 0x22;
const LEVEL_FULL_ON = 200;
const NON_GROUP = 0xff;
const DGN = "1FFBC";

// --- Input Validation ---
const instance = msg.instance;

if (typeof instance !== "number" || instance < 1 || instance > 250) {
    node.warn(`[encode_dc_load_command] Invalid instance: ${instance}`);
    return null;
}

// --- Parse Command ---
// JSON schema: payload is always an object
const command = msg.payload.state;
const brightness = msg.payload.brightness;

const dimmableLights = global.get("dimmableLights", "file") || [];
const isDimmable = dimmableLights.includes(instance);

// --- Command Mapping ---
let commandCode, desiredLevel;

if (command === "OFF") {
    commandCode = CMD_OFF;
    desiredLevel = 0;
} else if (command === "ON" && brightness !== undefined && brightness > 0) {
    commandCode = CMD_SET_LEVEL;
    desiredLevel = Math.round(brightness * 2);
} else if (isDimmable) {
    const lastBrightness =
        global.get("dimmerBrightness_" + instance, "file") || 100;
    commandCode = CMD_SET_LEVEL;
    desiredLevel = Math.round(lastBrightness * 2);
} else {
    commandCode = CMD_ON;
    desiredLevel = LEVEL_FULL_ON;
}

// --- Helper Functions ---
function buildCanMessage(instance, level, cmd) {
    const dataBytes = new Array(8).fill(0xff);
    dataBytes[0] = instance; // Byte 0: Instance
    dataBytes[1] = NON_GROUP; // Byte 1: Group
    dataBytes[2] = level; // Byte 2: Desired Level
    dataBytes[3] = 0xff; // Byte 3: Mode/Interlock/Direction (no change)
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

return null;
