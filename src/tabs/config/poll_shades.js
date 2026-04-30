// Polling Function for Shades
// Requests WINDOW_SHADE_CONTROL_STATUS (1FEDE)

// --- Configuration ---
// The source address of this Node-RED system.
const SOURCE_ADDRESS = global.get("rvc_source_address") || 254; // 0xFE
const PRIORITY = 6;       // Standard priority for requests (Included in 18EAFF)
const DGN = "18EAFF";     // DGN for a broadcast request message

// The DGN for WINDOW_SHADE_CONTROL_STATUS
const REQUESTED_DGN = "01FEDE";

// Build the data payload
// The payload is the DGN being requested, sent in 3-byte little-endian format.
// The remaining 5 bytes are padded with 0xFF.
const requestedDgnInt = parseInt(REQUESTED_DGN, 16);
const dataPayloadBytes = new Uint8Array(8);
dataPayloadBytes.fill(0xFF); // Pad the entire payload with 0xFF first
dataPayloadBytes[0] = requestedDgnInt & 0xFF;         // Byte 1: DE
dataPayloadBytes[1] = (requestedDgnInt >> 8) & 0xFF;  // Byte 2: FE
dataPayloadBytes[2] = (requestedDgnInt >> 16) & 0xFF; // Byte 3: 01
const data_payload_hex = Array.from(dataPayloadBytes).map(b => b.toString(16).padStart(2, '0')).join('');

// Construct the CAN ID
// Combine the DGN (which already includes Priority 6 and PGN 0xEAFF) with the Source Address.
const dgnInt = parseInt(DGN, 16);
const canIdInt = (dgnInt << 8) | SOURCE_ADDRESS;
const canIdHex = canIdInt.toString(16).padStart(8, '0');

// Construct the final output message in CAN bus format
msg.topic = "can/send";
msg.payload = `${canIdHex.toUpperCase()}#${data_payload_hex.toUpperCase()}`;

// node.warn(`[Poll Shades] Sending global request for shade status. CAN: ${msg.payload}`);

return msg;