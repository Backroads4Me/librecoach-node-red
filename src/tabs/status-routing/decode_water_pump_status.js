// Status Updater for Water Pump
// Decodes WATER_PUMP_STATUS messages (1FFB3)

if (!msg.payload || typeof msg.payload !== "object") {
  node.warn("Invalid payload: expected object");
  return null;
}

const data_payload = msg.payload.data_payload;

if (!data_payload) {
  node.warn("Missing data_payload");
  return null;
}

// We only need the first byte for the status
if (data_payload.length < 2) {
  node.warn("Data payload is too short to decode.");
  return null;
}

// Get the first byte and parse it
const firstByte = parseInt(data_payload.substring(0, 2), 16);

// Extract the first two bits (00-11) which represent the operating status
const statusBits = firstByte & 0x03; // Mask to get only the first two bits

// A value of 1 means "enabled"
const finalStatus = statusBits === 1 ? "ON" : "OFF";

// Prepare the payload for the downstream status updater node
msg.payload = {
  ...msg.payload, // Keep the original message data
  instance: "water_pump",
  status: finalStatus,
};

return msg;
