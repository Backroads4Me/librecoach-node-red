// Status Updater for AC Load
// Decodes AC_LOAD_STATUS messages (1FFBF)

// === Helper Functions ===

function decodeBits(value, startBit, endBit) {
    const mask = ((1 << (endBit - startBit + 1)) - 1) << startBit;
    return (value & mask) >> startBit;
}

// === AC_LOAD_STATUS Specific Decoders ===

function decodeLoadInstance(value) {
    // Load instance interpretation
    if (value === 0) {
        return "Invalid";
    } else if (value <= 250) {
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

function decodeGroupBitmap(value) {
    // Group membership bitmap (7 groups max)
    if (value === 0) {
        return "All Groups";
    } else if (value === 255) {
        return "No Data";
    }

    const groups = [];
    for (let i = 1; i <= 7; i++) {
        const groupBit = 1 << (i - 1); // Group 1 = bit 0, Group 2 = bit 1, etc.
        if (!(value & groupBit)) {
            // Inverted logic - 0 means member
            groups.push(i);
        }
    }

    return groups.length > 0 ? `Groups: ${groups.join(", ")}` : "No Groups";
}

function decodeOperatingLevel(value) {
    // Operating status/level (0-100% for dimmable, or special values)
    if (value <= 200) {
        return parseFloat((value * 0.5).toFixed(1)); // 0.5% per step, 0-100%
    } else if (value === 252) {
        return "Load Delay Active";
    } else if (value === 253) {
        return "Out of Range";
    } else if (value === 254) {
        return "Reserved";
    } else if (value === 255) {
        return "Not Available";
    }
    return "Invalid";
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

function decodeVariableCapability(value) {
    // Variable level capability (2-bit field)
    const capabilities = {
        0: "Not Variable (Not Dimmable)",
        1: "Variable (Dimmable)",
        2: "Reserved",
        3: "Not Supported",
    };
    return capabilities[value] || "Unknown";
}

function decodePriority(value) {
    // Load priority (4-bit field)
    if (value <= 13) {
        return `Priority ${value} (${value === 0 ? "Highest" : value === 13 ? "Lowest" : "Medium"})`;
    } else if (value === 14) {
        return "Error";
    } else if (value === 15) {
        return "No Data";
    }
    return "Invalid";
}

function decodeDelay(value) {
    // Delay before load activation
    if (value <= 240) {
        return `${value} seconds`;
    } else if (value >= 241 && value <= 250) {
        return `${value - 236} minutes`; // 241-250 = 5-14 minutes
    } else if (value === 255) {
        return "Not Available";
    }
    return "Invalid";
}

function decodeCurrent(value) {
    // Current in amperes per Table 5.3 (0.05A resolution for small values)
    if (value <= 250) {
        return parseFloat((value * 0.05).toFixed(2)); // 0.05A per step
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

function decodeUint16(data, startByte) {
    // Decode 16-bit value (little-endian)
    if (!data || startByte + 1 >= data.length) {
        return 65535; // Not available
    }
    return data[startByte] | (data[startByte + 1] << 8);
}

// === Main Decode Function ===

function decodeACLoadMessage(dgn, data) {
    const result = {
        dgn: dgn,
        dgn_name: "AC_LOAD_STATUS",
    };

    // Determine if this is AC_LOAD_STATUS or AC_LOAD_STATUS_2
    const dgnHex = dgn.toUpperCase();

    if (dgnHex === "1FFBF") {
        // AC_LOAD_STATUS (standard status)
        result.status_type = "AC_LOAD_STATUS";

        if (data.length >= 8) {
            // Byte 0: Instance
            result.instance = decodeLoadInstance(data[0]);

            // Byte 1: Group membership bitmap
            result.group_membership = decodeGroupBitmap(data[1]);

            // Byte 2: Operating status (level)
            result.operating_level = decodeOperatingLevel(data[2]);

            // Byte 3: Mode, capability, and priority bits
            const byte3 = data[3];
            result.operating_mode = decodeOperatingMode(decodeBits(byte3, 0, 1));
            result.variable_capability = decodeVariableCapability(
                decodeBits(byte3, 2, 3),
            );
            result.load_priority = decodePriority(decodeBits(byte3, 4, 7));

            // Byte 4: Delay
            result.activation_delay = decodeDelay(data[4]);

            // Byte 5: Demanded current
            result.demanded_current = decodeCurrent(data[5]);

            // Bytes 6-7: Present current (uint16, little-endian)
            const presentCurrentRaw = decodeUint16(data, 6);
            result.present_current = decodeCurrent(Math.min(presentCurrentRaw, 255)); // Scale down if needed

            // Raw values for debugging
            result.raw_present_current = presentCurrentRaw;
            result.raw_control_byte = byte3;
        }
    } else if (dgnHex === "1FEDD") {
        // AC_LOAD_STATUS_2 (extended status)
        result.status_type = "AC_LOAD_STATUS_2";

        if (data.length >= 4) {
            // Byte 0: Instance
            result.instance = decodeLoadInstance(data[0]);

            // Byte 1: Status bits
            const byte1 = data[1];
            const lockStatus = decodeBits(byte1, 0, 1);
            const overcurrentStatus = decodeBits(byte1, 2, 3);
            const overrideStatus = decodeBits(byte1, 4, 5);
            const enableStatus = decodeBits(byte1, 6, 7);

            const statusStates = [
                "Normal",
                "Active/Fault",
                "Reserved",
                "Not Supported",
            ];
            result.lock_status =
                lockStatus === 0 ? "Unlocked" : statusStates[lockStatus] || "Unknown";
            result.overcurrent_status = statusStates[overcurrentStatus] || "Unknown";
            result.override_status = statusStates[overrideStatus] || "Unknown";
            result.enable_status =
                enableStatus === 0
                    ? "Enabled"
                    : statusStates[enableStatus] || "Unknown";

            // Byte 2: Last command
            result.last_command = data[2]; // Command code - would need command lookup table for name

            // Byte 3: Interlock status
            if (data.length > 3) {
                const interlockStatus = decodeBits(data[3], 0, 1);
                result.interlock_status =
                    interlockStatus === 0
                        ? "Not Active"
                        : interlockStatus === 1
                            ? "Active"
                            : "Not Supported";
            }

            // Raw values for debugging
            result.raw_status_byte = byte1;
        }
    }

    // Add convenience fields
    if (result.operating_level !== undefined) {
        result.load_active =
            typeof result.operating_level === "number" && result.operating_level > 0;
    }

    if (result.variable_capability !== undefined) {
        result.is_dimmable = result.variable_capability.includes("Dimmable");
    }

    if (result.operating_mode !== undefined) {
        result.can_auto_control = result.operating_mode === "Automatic";
    }

    // Load health assessment
    result.load_healthy = true;
    if (result.overcurrent_status === "Active/Fault") result.load_healthy = false;
    if (result.enable_status === "Active/Fault") result.load_healthy = false;

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

// Decode the AC_LOAD_STATUS message
const decodedData = decodeACLoadMessage(dgn, dataBytes);

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
