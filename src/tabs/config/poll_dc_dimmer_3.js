// Polling Function for DC Dimmer
// Requests DC_DIMMER_STATUS_3 (1FEDA)

// --- Configuration ---
// The source address of this Node-RED system.
const SOURCE_ADDRESS = global.get("rvc_source_address") || 254;
const PRIORITY = 6; // Standard priority for requests
const DGN = "18EAFF"; // DGN for a broadcast request message

// Build the data payload
// This is the DGN for DC_DIMMER_STATUS_3 (1FEDA), sent in little-endian format (least-significant byte first).
const data_payload = "DAFE01FFFFFFFF";

// Construct the CAN ID
const dgnInt = parseInt(DGN, 16);
const canIdInt = (dgnInt << 8) | SOURCE_ADDRESS;
const canIdHex = canIdInt.toString(16).padStart(8, "0");

// Construct the final output message in CAN bus format
msg.topic = "can/send";
msg.payload = `${canIdHex.toUpperCase()}#${data_payload.toUpperCase()}`;

node.log(`Polling started`);

return msg;
