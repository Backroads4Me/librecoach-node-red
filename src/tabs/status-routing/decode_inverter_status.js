// Decodes INVERTER_STATUS messages (1FFD4)
// RV-C §6.19.8 — INVERTER_STATUS

// === Helper Functions ===

function decodeBits(value, startBit, endBit) {
    const mask = ((1 << (endBit - startBit + 1)) - 1) << startBit;
    return (value & mask) >> startBit;
}

// §6.19.8b — Byte 1: Status
function decodeInverterStatus(raw) {
    const states = {
        0: "Disabled",
        1: "Invert",
        2: "AC Passthru",
        3: "APS Only",
        4: "Load Sense",
        5: "Waiting to Invert",
        6: "Generator Support",
    };
    if (raw === 255) return null;
    return states[raw] || `Unknown (${raw})`;
}

// uint2 feature flag: 0=Disabled, 1=Enabled, 2=Reserved, 3=Not Available
function decodeFeatureFlag(val) {
    if (val === 3) return null;
    return val === 1;
}

// === Main Decode Function ===

function decodeInverterStatusMsg(dgn, data) {
    const result = {
        dgn: dgn,
        dgn_name: "INVERTER_STATUS",
    };

    // Byte 0: Instance
    result.instance = data[0] === 255 ? null : data[0];
    result.raw_instance = data[0];

    // Byte 1: Status
    result.status = decodeInverterStatus(data[1]);
    result.raw_status = data[1];

    // Byte 2: Feature flags
    const b2 = data[2];
    result.battery_temp_sensor_present = decodeFeatureFlag(decodeBits(b2, 0, 1));
    result.load_sense_enabled = decodeFeatureFlag(decodeBits(b2, 2, 3));
    result.inverter_enabled = decodeFeatureFlag(decodeBits(b2, 4, 5));
    result.passthrough_enabled = decodeFeatureFlag(decodeBits(b2, 6, 7));
    result.raw_b2 = b2;

    // Byte 3: More feature flags
    if (data.length > 3) {
        const b3 = data[3];
        result.generator_support_enabled = decodeFeatureFlag(decodeBits(b3, 0, 1));
        result.raw_b3 = b3;
    }

    // Convenience booleans
    result.is_inverting = result.status === "Invert";
    result.is_passthrough = result.status === "AC Passthru";
    result.is_disabled = result.status === "Disabled";

    return result;
}

// === Main Logic ===

if (!msg.payload || typeof msg.payload !== "object") {
    node.warn("Invalid payload: expected object");
    return null;
}

const incomingPayload = msg.payload;
const { dgn, data_payload } = incomingPayload;

if (!dgn || !data_payload) {
    node.warn("Missing required fields: dgn and/or data_payload");
    return null;
}

if (typeof data_payload !== "string" || data_payload.length % 2 !== 0) {
    node.warn("Invalid data_payload: must be even-length hex string");
    return null;
}

const dataBytes = data_payload.match(/.{1,2}/g).map((b) => parseInt(b, 16));

if (dataBytes.length < 3) {
    node.warn(
        `INVERTER_STATUS requires at least 3 bytes, got ${dataBytes.length}`,
    );
    return null;
}

const decoded = decodeInverterStatusMsg(dgn, dataBytes);

msg.payload = { ...incomingPayload, ...decoded };
delete msg.payload.data_payload;

return msg;
