// Encodes AquaHot switch commands via 1FE98 (WATERHEATER_COMMAND_2) and FF2F (AQUAHOT_COMMAND_2)
// Uses FF2F (AQUAHOT_COMMAND_2) cmd_type 0x0a for interior heating priority
// Entity IDs: aquahot_diesel_burner, aquahot_electric_element, aquahot_quiet_mode, aquahot_interior_heating

const SOURCE_ADDRESS = global.get("rvc_source_address") || 254;

const entityId = msg.entityId;
const command = msg.command; // "ON" or "OFF"

if (!entityId || !command) return null;

function send1FE98(byte1, byte2) {
  // CAN ID: priority 6, DGN 1FE98, source address
  // DGN 1FE98 is PDU2 format (PF >= 240), so full 18-bit DGN goes in bits 25-8
  // Result for claimed source 0xDF: 0x19FE98DF
  const DGN_INT = 0x1fe98;
  const PRIORITY = 6;
  const canIdInt = (PRIORITY << 26) | (DGN_INT << 8) | SOURCE_ADDRESS;
  const canIdHex = canIdInt.toString(16).padStart(8, "0");
  const dataBytes = new Array(8).fill(0xff);
  // Byte 0: Instance. Confirmed via bus capture — the physical panel always
  // sends 0x01 here, never 0xFF (broadcast).
  dataBytes[0] = 0x01;
  dataBytes[1] = byte1;
  dataBytes[2] = byte2;
  const dataHex = dataBytes
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  node.send({
    topic: "can/send",
    payload: `${canIdHex.toUpperCase()}#${dataHex.toUpperCase()}`,
  });
}

function sendFF2F(cmdType, isOn) {
  // CAN ID: priority 6, DGN FF2F, source address
  // Result for claimed source 0xDF: 0x18FF2FDF
  const DGN_INT = 0xff2f;
  const PRIORITY = 6;
  const canIdInt = (PRIORITY << 26) | (DGN_INT << 8) | SOURCE_ADDRESS;
  const canIdHex = canIdInt.toString(16).padStart(8, "0");
  const dataBytes = new Array(8).fill(0xff);
  dataBytes[0] = 0x01; // instance
  dataBytes[1] = cmdType;
  dataBytes[2] = 0x00;
  dataBytes[3] = isOn ? 0x01 : 0x00;
  dataBytes[4] = 0x00;
  dataBytes[5] = 0x00;
  const dataHex = dataBytes
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  node.send({
    topic: "can/send",
    payload: `${canIdHex.toUpperCase()}#${dataHex.toUpperCase()}`,
  });
}

// 1FE98 burner/electric commands are TOGGLES, not set/clear. The AquaHot's
// physical state (cached from WATERHEATER_STATUS 1FFF7 by status_waterheater.js
// on the Status routing tab, via global file context — flow context does not
// cross tabs) must differ from the desired command before toggling; toggling
// blind can reverse a command that raced with the physical panel.
function toggleIfNeeded(stateKey, byte1, label) {
  const desiredOn = command === "ON";
  const currentOn = global.get(stateKey, "file");

  if (currentOn === desiredOn) {
    node.status({
      fill: "grey",
      shape: "dot",
      text: `${label} already ${command}`,
    });
    return;
  }

  if (currentOn === undefined) {
    node.warn(
      `[encode_waterheater_command_2] ${label}: no known physical state yet, sending toggle anyway`,
    );
  }

  send1FE98(byte1, 0xff);
  // Optimistically assume the toggle lands so a rapid second command doesn't
  // re-toggle before the next status frame; the next 1FFF7 corrects it.
  global.set(stateKey, desiredOn, "file");
  node.status({
    fill: "blue",
    shape: "dot",
    text: `${label} toggle -> ${command}`,
  });
}

switch (entityId) {
  case "aquahot_diesel_burner":
    toggleIfNeeded("aquahot_burner_active", 0xf6, "Diesel burner");
    break;
  case "aquahot_electric_element":
    toggleIfNeeded("aquahot_electric_active", 0x6f, "Electric element");
    break;
  case "aquahot_quiet_mode":
    sendFF2F(0x07, command === "ON");
    node.status({
      fill: "blue",
      shape: "dot",
      text: `Quiet mode -> ${command}`,
    });
    break;
  case "aquahot_interior_heating":
    sendFF2F(0x0a, command === "ON");
    node.status({
      fill: "blue",
      shape: "dot",
      text: `Interior heating -> ${command}`,
    });
    break;
  default:
    node.warn(`[encode_waterheater_command_2] Unknown entityId: ${entityId}`);
}

return null;
