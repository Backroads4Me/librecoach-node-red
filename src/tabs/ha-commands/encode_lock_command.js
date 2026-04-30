// Encodes LOCK_COMMAND messages (1FEE4)

// --- Configuration ---
const SOURCE_ADDRESS = global.get("rvc_source_address") || 254;
const PRIORITY = 6;
const DGN = "1FEE4";

// --- Input Validation ---
const instance = msg.instance;
const command = msg.command; // Expects "LOCK" or "UNLOCK"

// Accept Instance 0 (broadcast to all locks)
if (typeof instance !== "number" || instance < 0 || instance > 250) {
  node.warn(`[encode_lock_command] Invalid instance: ${instance}`);
  return null;
}

// --- Command Mapping ---
let lockCommand;
switch (command) {
  case "UNLOCK":
    lockCommand = 0; // Unlock
    break;
  case "LOCK":
    lockCommand = 1; // Lock
    break;
  default:
    node.warn(
      `[encode_lock_command] Invalid command: "${command}". Expected "LOCK" or "UNLOCK"`,
    );
    return null;
}

// --- Build Payload ---
const dataBytes = new Array(8).fill(0xff);
dataBytes[0] = instance; // Byte 0: Instance Number
dataBytes[1] = lockCommand; // Byte 1: Lock Command (0=unlock, 1=lock)
dataBytes[2] = 0; // Byte 2: Additional Command (0=no action)
dataBytes[3] = 0xff; // Byte 3: Not Available
dataBytes[4] = 0xff; // Byte 4: Not Available
dataBytes[5] = 0xff; // Byte 5: Not Available
dataBytes[6] = 0xff; // Byte 6: Not Available
dataBytes[7] = 0xff; // Byte 7: Not Available

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
