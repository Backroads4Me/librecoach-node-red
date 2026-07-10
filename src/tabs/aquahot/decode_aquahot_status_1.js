// Aqua-Hot 400/600-Series systems
// Status Updater for Aqua-Hot
// Decodes proprietary AQUAHOT status byte into individual status messages

// Maps the bit position to the instance name
const BIT_MAP = {
  0: "burner", // Burner Status (Bit 0)
  2: "ac_1", // AC Element 1 Status (Bit 2)
  3: "ac_2", // AC Element 2 Status (Bit 3)
  6: "engine", // Engine Pre-heat Status (Bit 6)
};

if (!msg.payload || typeof msg.payload !== "object") {
  node.warn("Invalid payload: expected object");
  return null;
}

const data_payload = msg.payload.data_payload;

if (!data_payload || data_payload.length < 4) {
  node.warn("Missing or short data_payload");
  return null;
}

// Extract the status byte (Byte 2 of the data payload)
const statusByte = parseInt(data_payload.substring(2, 4), 16);

let outputMessages = [];

// Decode the individual status bits
for (const bit in BIT_MAP) {
  const bitIndex = Number(bit);
  const instance = BIT_MAP[bitIndex];

  // Check if the bit is set (Bit = 1 for ON)
  const isBitSet = (statusByte >> bitIndex) & 1;
  const status = isBitSet ? "ON" : "OFF";

  // Prepare the message following the standard pattern
  const statusMsg = {
    payload: {
      instance,
      status,
    },
  };

  outputMessages.push(statusMsg);
}

// Send all four status updates simultaneously
return [outputMessages];
