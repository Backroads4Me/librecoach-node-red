// Encodes WATER_PUMP_COMMAND messages (1FFB2)

// --- Configuration ---
const SOURCE_ADDRESS = global.get("rvc_source_address") || 254;
const PRIORITY = 6;
const DGN = "1FFB2";

// --- Input Validation ---
const command = msg.command; // Expects "ON" or "OFF"

// --- Command Mapping ---
let pumpCommandValue;
switch (command) {
  case "ON":
    pumpCommandValue = 1; // 01b = Enable pump (standby)
    break;
  case "OFF":
    pumpCommandValue = 0; // 00b = Disable pump
    break;
  default:
    node.warn(
      `[encode_water_pump_command] Invalid command: "${command}". Expected "ON" or "OFF"`,
    );
    return null;
}

// --- Build Payload ---
// Byte 0 contains the command. All other bytes are set to 0xFF (Not Available)
const dataBytes = new Array(8).fill(0xff);
dataBytes[0] = pumpCommandValue; // Byte 0: Pump command

const dataHex = dataBytes
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("");

// Construct the CAN ID
const dgnInt = parseInt(DGN, 16);
const canIdInt = (PRIORITY << 26) | (dgnInt << 8) | SOURCE_ADDRESS;
const canIdHex = canIdInt.toString(16).padStart(8, "0");

// --- Send Message ---
node.send({
  topic: "can/send",
  payload: `${canIdHex.toUpperCase()}#${dataHex.toUpperCase()}`,
});

return null;
