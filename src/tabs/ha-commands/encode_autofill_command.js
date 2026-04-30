// Encodes AUTOFILL_COMMAND messages (1FFB0)

// --- Configuration ---
const SOURCE_ADDRESS = global.get("rvc_source_address") || 254;
const PRIORITY = 6;
const DGN = "1FFB0"; // AUTOFILL_COMMAND

// --- Input Validation ---
const command = msg.command; // Expects "ON" or "OFF"

// --- Command Mapping ---
let commandValue;
switch (command) {
  case "ON":
    // Universal ON command that works on standard and non-standard systems
    commandValue = 0xfd;
    break;
  case "OFF":
    // Universal OFF command
    commandValue = 0xfc;
    break;
  default:
    node.warn(
      `[encode_autofill_command] Invalid command: "${command}". Expected "ON" or "OFF"`,
    );
    return null;
}

// --- Build Payload ---
const dataBytes = new Array(8).fill(0xff);
dataBytes[0] = commandValue; // Byte 0: Command value

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
