// Polling Function for Water Pump
// Requests WATER_PUMP_STATUS (1FFB3)

// --- Configuration ---
// The source address of this Node-RED system.
const SOURCE_ADDRESS = global.get("rvc_source_address") || 254;
const PRIORITY = 6;       // Standard priority for requests
const DGN = "18EAFF";     // DGN for a broadcast request message

// Build the data payload
// This is the DGN for WATER_PUMP_STATUS (1FFB3), sent in little-endian format (least-significant byte first).
const data_payload = "B3FB01FFFFFFFF";

// Construct the CAN ID
const dgnInt = parseInt(DGN, 16);
const canIdInt = (dgnInt << 8) | SOURCE_ADDRESS;
const canIdHex = canIdInt.toString(16).padStart(8, '0');

// Construct the final output message in CAN bus format
msg.topic = "can/send";
msg.payload = `${canIdHex.toUpperCase()}#${data_payload.toUpperCase()}`;

//node.warn(`[Poll Water Pump] Sending global request for water pump status. CAN: ${msg.payload}`);

return msg;
