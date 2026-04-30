// Polling Function for DC Load
// Requests DC_LOAD_STATUS (1FFBD)

// --- Configuration ---
const SOURCE_ADDRESS = global.get("rvc_source_address") || 254;
const PRIORITY = 6;
const DGN = "18EAFF";

// DC_LOAD_STATUS DGN 1FFBD in little-endian: BD FF 01
const data_payload = "BDFF01FFFFFFFF";

// Construct the CAN ID
const dgnInt = parseInt(DGN, 16);
const canIdInt = (PRIORITY << 26) | (dgnInt << 8) | SOURCE_ADDRESS;
const canIdHex = canIdInt.toString(16).padStart(8, "0");

msg.topic = "can/send";
msg.payload = `${canIdHex.toUpperCase()}#${data_payload.toUpperCase()}`;

node.log(`Polling DC Load status`);

return msg;
