// Encodes WINDOW_SHADE_COMMAND messages (1FEDF)

// --- Configuration ---
const SOURCE_ADDRESS = global.get("rvc_source_address") || 254;
const PRIORITY = 6;
const DGN = "1FEDF";

// --- Input Validation ---
const instance = msg.instance;
const command = msg.command; // Expects "OPEN", "CLOSE", or "STOP"

if (typeof instance !== "number" || instance < 1 || instance > 250) {
  node.warn(`[encode_shade_command] Invalid instance: ${instance}`);
  return null;
}

// --- Command Mapping ---
let shadeCommand;
let duration = 30; // 30 seconds duration (matches switch panel)

switch (command) {
  case "OPEN":
    shadeCommand = 0x85; // Toggle Forward (Raise/Open)
    break;
  case "CLOSE":
    shadeCommand = 0x45; // Toggle Reverse (Lower/Close)
    break;
  case "STOP":
    shadeCommand = 0x04; // Stop
    duration = 0; // Duration is ignored for STOP
    break;
  default:
    node.warn(
      `[encode_shade_command] Invalid command: "${command}". Expected "OPEN", "CLOSE", or "STOP"`,
    );
    return null;
}

// --- Build Payload ---
const motorDuty = 200; // Use 200% motor duty (matches switch panel)
const dataBytes = new Array(8).fill(0xff);
dataBytes[0] = instance; // Byte 0: Instance Number
dataBytes[1] = 0xff; // Byte 1: Group (Non-group command)
dataBytes[2] = motorDuty; // Byte 2: Motor Duty Cycle
dataBytes[3] = shadeCommand; // Byte 3: Command Code
dataBytes[4] = duration; // Byte 4: Duration
dataBytes[5] = 0x00; // Byte 5: Interlock (No Interlock)
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
