// Status Updater for ATS AC
// Decodes ATS_AC_STATUS messages

// === Helper Functions ===

function decodeBits(value, startBit, endBit) {
    const mask = ((1 << (endBit - startBit + 1)) - 1) << startBit;
    return (value & mask) >> startBit;
}

// === ATS_AC_STATUS Specific Decoders ===

function decodeATSACInstance(value) {
    // ATS AC instance interpretation
    // For ATS, this typically indicates the AC input/output line being monitored
    if (value <= 200) {
        return value; // Direct instance number
    } else if (value === 251) {
        return "Error";
    } else if (value === 252) {
        return "Not Supported";
    } else if (value === 253) {
        return "Out of Range";
    } else if (value === 254) {
        return "Reserved";
    } else if (value === 255) {
        return "Not Available";
    }
    return "Invalid";
}

function decodeACVoltage(value) {
    // AC RMS voltage (see Table 5.3 - standard RV-C scaling)
    if (value <= 65530) {
        return parseFloat((value * 0.05).toFixed(1)); // 0.05V per step
    } else if (value === 65533) {
        return "Out of Range";
    } else if (value === 65534) {
        return "Reserved";
    } else if (value === 65535) {
        return "Not Available";
    }
    return "Invalid";
}

function decodeACCurrent(value) {
    // AC RMS current (see Table 5.3 - standard RV-C scaling)
    // Special case: 0x7D00 (32000) often represents zero in RV-C AC measurements
    if (value === 32000) {
        return 0; // Special zero encoding
    } else if (value <= 65530) {
        return parseFloat((value * 0.05).toFixed(2)); // 0.05A per step
    } else if (value === 65533) {
        return "Out of Range";
    } else if (value === 65534) {
        return "Reserved";
    } else if (value === 65535) {
        return "Not Available";
    }
    return "Invalid";
}

function decodeFrequency(value) {
    // AC frequency with 1/128 Hz precision, 0-500 Hz range
    if (value <= 64000) {
        return parseFloat((value / 128).toFixed(2)); // 1/128 Hz per step
    } else if (value === 65533) {
        return "Out of Range";
    } else if (value === 65534) {
        return "Reserved";
    } else if (value === 65535) {
        return "Not Available";
    }
    return "Invalid";
}

function decodeFaultBits(value) {
    // Decode fault bits from byte 7 - ATS-specific fault interpretation
    const faults = [];

    const openGround = decodeBits(value, 0, 1);
    const openNeutral = decodeBits(value, 2, 3);
    const reversePolarity = decodeBits(value, 4, 5);
    const groundCurrent = decodeBits(value, 6, 7);

    if (openGround === 1) faults.push("Open Ground");
    if (openNeutral === 1) faults.push("Open Neutral");
    if (reversePolarity === 1) faults.push("Reverse Polarity");
    if (groundCurrent === 1) faults.push("Ground Current Fault");

    return {
        faults: faults.length > 0 ? faults.join(", ") : "No Faults",
        open_ground: openGround === 1,
        open_neutral: openNeutral === 1,
        reverse_polarity: reversePolarity === 1,
        ground_current_fault: groundCurrent === 1,
        any_fault: faults.length > 0,
    };
}

function decodeUint16(data, startByte) {
    // Decode 16-bit value (little-endian)
    if (!data || startByte + 1 >= data.length) {
        return 65535; // Not available
    }
    return data[startByte] | (data[startByte + 1] << 8);
}

// === Main Decode Function ===

function decodeATSACMessage(dgn, data) {
    const result = {
        dgn: dgn,
        dgn_name: "ATS_AC_STATUS",
    };

    // Decode based on AC_STATUS_1 format (8 bytes)
    if (data.length >= 8) {
        // Byte 0: Instance
        result.instance = decodeATSACInstance(data[0]);

        // Bytes 1-2: RMS Voltage (uint16, little-endian)
        const voltageRaw = decodeUint16(data, 1);
        result.rms_voltage = decodeACVoltage(voltageRaw);

        // Bytes 3-4: RMS Current (uint16, little-endian)
        const currentRaw = decodeUint16(data, 3);
        result.rms_current = decodeACCurrent(currentRaw);

        // Bytes 5-6: Frequency (uint16, little-endian)
        const frequencyRaw = decodeUint16(data, 5);
        result.frequency = decodeFrequency(frequencyRaw);

        // Byte 7: Fault bits
        if (data.length > 7) {
            const faultInfo = decodeFaultBits(data[7]);
            result.fault_status = faultInfo.faults;
            result.open_ground = faultInfo.open_ground;
            result.open_neutral = faultInfo.open_neutral;
            result.reverse_polarity = faultInfo.reverse_polarity;
            result.ground_current_fault = faultInfo.ground_current_fault;
            result.any_fault = faultInfo.any_fault;
        }

        // Raw values for debugging
        result.raw_voltage = voltageRaw;
        result.raw_current = currentRaw;
        result.raw_frequency = frequencyRaw;
        if (data.length > 7) {
            result.raw_fault_byte = data[7];
        }
    }

    // Add convenience fields for ATS operations
    result.ac_source_available =
        result.rms_voltage !== "Not Available" &&
        typeof result.rms_voltage === "number" &&
        result.rms_voltage > 50; // Reasonable AC voltage threshold

    result.ats_load_present =
        result.rms_current !== "Not Available" &&
        typeof result.rms_current === "number" &&
        result.rms_current > 0.1; // Some current flow

    result.ac_source_qualified =
        result.ac_source_available &&
        !result.any_fault &&
        typeof result.frequency === "number" &&
        result.frequency >= 58 &&
        result.frequency <= 62; // Reasonable frequency range

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

// Decode the ATS_AC_STATUS message
const decodedData = decodeATSACMessage(dgn, dataBytes);

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
