// Encodes GENERATOR_DEMAND_COMMAND messages (1FEFF)
// §6.35.3 — preferred method for network-initiated start/stop (respects Quiet Time)

const SOURCE_ADDRESS = global.get("rvc_source_address") || 254;
const PRIORITY = 6;
const DGN = "1FEFF";

const command = msg.command; // Expects "ON" or "OFF"

let demandByte;
switch (command) {
  case "ON":
    demandByte = 0x01; // bits 0-1 = 01 = Generator power demanded
    break;
  case "OFF":
    demandByte = 0x00; // bits 0-1 = 00 = No demand
    break;
  default:
    node.warn(
      `[encode_generator_demand_command] Invalid command: "${command}". Expected "ON" or "OFF"`,
    );
    return null;
}

const dataBytes = new Array(8).fill(0xff);
dataBytes[0] = demandByte;

const dataHex = dataBytes
  .map((b) => b.toString(16).padStart(2, "0"))
  .join("");

const dgnInt = parseInt(DGN, 16);
const canIdInt = (PRIORITY << 26) | (dgnInt << 8) | SOURCE_ADDRESS;
const canIdHex = canIdInt.toString(16).padStart(8, "0");

node.send({
  topic: "can/send",
  payload: `${canIdHex.toUpperCase()}#${dataHex.toUpperCase()}`,
});

return null;
