// Encodes AquaHot Commands (EF64)

// --- Configuration ---
const SOURCE_ADDRESS = global.get("rvc_source_address") || 254;
const DESTINATION_ADDRESS = 0x9f; // Aqua-Hot Module
const PRIORITY = 6; // Confirmed priority for Aqua-Hot control
const PGN = "EF64";
const PGN_INT = parseInt(PGN, 16);
const CONTROL_BYTE = 0xab; // First data byte for all commands

// --- Command Mapping (PGN EF64) ---
const COMMAND_MAP = {
    // Diesel Burner Control
    burner: {
        ON: 0xfd,
        OFF: 0xfc,
    },
    // AC Element 1 Control
    ac_1: {
        ON: 0xc7,
        OFF: 0xc3,
    },
    // AC Element 2 Control
    ac_2: {
        ON: 0xcb,
        OFF: 0xc3,
    },
    // Engine Pre-heat Control
    engine: {
        ON: 0x7f,
        OFF: 0x3f,
    },
};

// --- Input Validation ---
const instance = msg.instance; // Expects "burner", "ac_1", "ac_2", or "engine"
const command = msg.command; // Expects "ON" or "OFF"

if (!instance || !COMMAND_MAP[instance]) {
    node.warn(
        `[encode_aquahot] Invalid instance: "${instance}". Expected one of: burner, ac_1, ac_2, engine`,
    );
    return null;
}

if (!command || !COMMAND_MAP[instance][command]) {
    node.warn(
        `[encode_aquahot] Invalid command: "${command}". Expected "ON" or "OFF"`,
    );
    return null;
}

// --- Build Payload ---
const dataByte2 = COMMAND_MAP[instance][command];

// Build the 8-byte data payload
const dataBytes = new Array(8).fill(0xff);
dataBytes[0] = CONTROL_BYTE; // AB
dataBytes[1] = dataByte2; // The specific command byte

const dataHex = dataBytes
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

// --- Construct CAN ID ---
// PGN EF64 is a PDU1 format (PF < 240) so the destination address (0x9F) goes in the last byte
const canIdInt = (PRIORITY << 26) | (PGN_INT << 8) | DESTINATION_ADDRESS;
const canIdHex = canIdInt.toString(16).padStart(8, "0");

// --- Send Message ---
node.send({
    topic: "can/send",
    payload: `${canIdHex.toUpperCase()}#${dataHex.toUpperCase()}`,
});

return null;
