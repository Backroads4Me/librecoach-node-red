// Encodes AquaHot 125D switch commands via 1FE98 (WATERHEATER_COMMAND_2) and FF2F (AQUAHOT_COMMAND_2)
// Uses FF2F (AQUAHOT_COMMAND_2) cmd_type 0x0a for interior heating priority
// Entity IDs: aquahot_diesel_burner, aquahot_electric_element, aquahot_quiet_mode, aquahot_interior_heating

const SOURCE_ADDRESS = global.get("rvc_source_address") || 0x9e;

const entityId = msg.entityId;
const command = msg.command; // "ON" or "OFF"

if (!entityId || !command) return null;

function send1FE98(byte1, byte2) {
  // CAN ID: priority 6, DGN 1FE98, source address
  // DGN 1FE98 is PDU2 format (PF >= 240), so full 18-bit DGN goes in bits 25-8
  // Result for source 0x9E: 0x19FE989E
  const DGN_INT = 0x1FE98;
  const PRIORITY = 6;
  const canIdInt = (PRIORITY << 26) | (DGN_INT << 8) | SOURCE_ADDRESS;
  const canIdHex = canIdInt.toString(16).padStart(8, "0");
  const dataBytes = new Array(8).fill(0xff);
  dataBytes[1] = byte1;
  dataBytes[2] = byte2;
  const dataHex = dataBytes.map(b => b.toString(16).padStart(2, "0")).join("");
  node.send({ topic: "can/send", payload: `${canIdHex.toUpperCase()}#${dataHex.toUpperCase()}` });
}

function sendFF2F(cmdType, isOn) {
  // CAN ID: priority 6, DGN FF2F, source address
  // Result for source 0x9E: 0x18FF2F9E
  const DGN_INT = 0xFF2F;
  const PRIORITY = 6;
  const canIdInt = (PRIORITY << 26) | (DGN_INT << 8) | SOURCE_ADDRESS;
  const canIdHex = canIdInt.toString(16).padStart(8, "0");
  const dataBytes = new Array(8).fill(0xff);
  dataBytes[0] = 0x01;      // instance
  dataBytes[1] = cmdType;
  dataBytes[2] = 0x00;
  dataBytes[3] = isOn ? 0x01 : 0x00;
  dataBytes[4] = 0x00;
  dataBytes[5] = 0x00;
  const dataHex = dataBytes.map(b => b.toString(16).padStart(2, "0")).join("");
  node.send({ topic: "can/send", payload: `${canIdHex.toUpperCase()}#${dataHex.toUpperCase()}` });
}

switch (entityId) {
  case "aquahot_diesel_burner":
    // Toggle semantics — send toggle regardless of ON/OFF command
    send1FE98(0xF6, 0xFF);
    node.status({ fill: "blue", shape: "dot", text: `Diesel burner toggle (${command})` });
    break;
  case "aquahot_electric_element":
    // Toggle semantics
    send1FE98(0x6F, 0xFF);
    node.status({ fill: "blue", shape: "dot", text: `Electric element toggle (${command})` });
    break;
  case "aquahot_quiet_mode":
    sendFF2F(0x07, command === "ON");
    node.status({ fill: "blue", shape: "dot", text: `Quiet mode -> ${command}` });
    break;
  case "aquahot_interior_heating":
    sendFF2F(0x0a, command === "ON");
    node.status({ fill: "blue", shape: "dot", text: `Interior heating -> ${command}` });
    break;
  default:
    node.warn(`[encode_waterheater_command_2] Unknown entityId: ${entityId}`);
}

return null;
