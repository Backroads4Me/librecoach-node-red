// Encodes GENERATOR_COMMAND messages (1FFDA)
// RV-C §6.18.25 — direct generator start/stop.

const SOURCE_ADDRESS = global.get("rvc_source_address") || 254;
const PRIORITY = 6;
const DGN = "1FFDA";

const command = msg.command; // Expects "ON" or "OFF"

let commandByte;
switch (command) {
  case "ON":
    commandByte = 0x01; // Start
    break;
  case "OFF":
    commandByte = 0x00; // Stop
    break;
  default:
    node.warn(
      `[encode_generator_command] Invalid command: "${command}". Expected "ON" or "OFF"`,
    );
    return null;
}

const dataBytes = new Array(8).fill(0xff);
dataBytes[0] = commandByte;

const dataHex = dataBytes.map((b) => b.toString(16).padStart(2, "0")).join("");

const dgnInt = parseInt(DGN, 16);
const canIdInt = (PRIORITY << 26) | (dgnInt << 8) | SOURCE_ADDRESS;
const canIdHex = canIdInt.toString(16).padStart(8, "0");

node.send({
  topic: "can/send",
  payload: `${canIdHex.toUpperCase()}#${dataHex.toUpperCase()}`,
});

return null;
