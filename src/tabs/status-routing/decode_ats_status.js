// Status Updater for ATS
// Decodes ATS_STATUS messages (1FF9C)

// === Helper Functions ===

function decodeBits(value, startBit, endBit) {
    const mask = ((1 << (endBit - startBit + 1)) - 1) << startBit;
    return (value & mask) >> startBit;
}

// === ATS_STATUS Specific Decoders ===

function decodeATSInstance(value) {
    // ATS instance interpretation
    if (value >= 1 && value <= 6) {
        return value; // Valid instances
    } else if (value === 0 || value >= 7) {
        return "Invalid Instance";
    }
    return "Invalid";
}

function decodeSourceInUse(value) {
    // Source currently in use
    if (value === 0) {
        return "Primary";
    } else if (value >= 1 && value <= 6) {
        return `Source ${value}`;
    } else if (value === 253) {
        return "No Source Active";
    } else if (value === 254) {
        return "Reserved";
    } else if (value === 255) {
        return "Not Available";
    }
    return "Invalid Source";
}

function decodeOperatingMode(value) {
    // Operating mode (2-bit field)
    const modes = {
        0: "Automatic",
        1: "Manual",
        2: "Reserved",
        3: "Not Supported",
    };
    return modes[value] || "Unknown";
}

// === Main Decode Function ===

function decodeATSMessage(dgn, data) {
    const result = {
        dgn: dgn,
        dgn_name: "ATS_STATUS",
    };

    if (data.length >= 3) {
        // Byte 0: ATS Instance
        result.instance = decodeATSInstance(data[0]);

        // Byte 1: Source in use
        result.source_in_use = decodeSourceInUse(data[1]);

        // Byte 2: Operating mode (bits 0-1)
        const byte2 = data[2];
        result.operating_mode = decodeOperatingMode(decodeBits(byte2, 0, 1));

        // Raw values for debugging
        result.raw_instance = data[0];
        result.raw_source = data[1];
        result.raw_mode_byte = byte2;
    }

    // Add convenience fields
    result.has_active_source =
        result.source_in_use !== "No Source Active" &&
        result.source_in_use !== "Not Available" &&
        !result.source_in_use.includes("Invalid");

    result.is_automatic_mode = result.operating_mode === "Automatic";
    result.is_manual_mode = result.operating_mode === "Manual";

    result.using_primary_source = result.source_in_use === "Primary";

    // Overall status assessment
    if (result.has_active_source) {
        result.transfer_switch_status = `Active on ${result.source_in_use}`;
    } else {
        result.transfer_switch_status = "No Active Source";
    }

    if (result.operating_mode === "Manual") {
        result.transfer_switch_status += " (Manual Mode)";
    } else if (result.operating_mode === "Automatic") {
        result.transfer_switch_status += " (Automatic Mode)";
    }

    return result;
}

// === Main Logic ===

// Validate input payload
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

// Validate and convert hex payload to byte array
if (typeof data_payload !== "string" || data_payload.length % 2 !== 0) {
    node.warn("Invalid data_payload: must be even-length hex string");
    return null;
}

const dataBytes = [];
for (let i = 0; i < data_payload.length; i += 2) {
    const hexByte = data_payload.substring(i, i + 2);
    const byteValue = parseInt(hexByte, 16);
    if (isNaN(byteValue)) {
        node.warn(`Invalid hex byte in data_payload: ${hexByte}`);
        return null;
    }
    dataBytes.push(byteValue);
}

// Decode the ATS_STATUS message
const decodedData = decodeATSMessage(dgn, dataBytes);

// Handle decode errors
if (decodedData.error) {
    incomingPayload.decoding_error = decodedData.error;
    msg.payload = incomingPayload;
    return msg;
}

// Merge the incoming payload and the decoded data into a single flat object
msg.payload = {
    ...incomingPayload,
    ...decodedData,
};

// Clean up the final object by removing the raw data field
delete msg.payload.data_payload;

return msg;
