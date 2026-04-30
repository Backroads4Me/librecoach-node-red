// Status Updater for Lock
// Decodes LOCK_STATUS messages (1FEE5)

// === Helper Functions ===

function decodeBits(value, startBit, endBit) {
    const mask = ((1 << (endBit - startBit + 1)) - 1) << startBit;
    return (value & mask) >> startBit;
}

// === LOCK_STATUS Specific Decoders ===

function decodeInstance(value) {
    // Lock instance mapping per Section 6.40.1
    if (value >= 1 && value <= 250) {
        return value; // Direct instance number
    } else if (value === 0) {
        return "Invalid";
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

function decodeLockStatus(value) {
    // Lock status (bits 0-1)
    const lockMap = {
        0: "Unlocked",
        1: "Locked"
    };
    return lockMap[value] || `Unknown Lock Status ${value}`;
}

function decodeMotion(value) {
    // Motion status
    const motionMap = {
        0: "No Motion",
        1: "Opening",
        2: "Closing"
    };
    return motionMap[value] || `Unknown Motion ${value}`;
}

function decodePosition(value) {
    // Position as percentage per Table 5.3 (100% = Fully Open)
    if (value <= 200) {
        return parseFloat((value * 0.5).toFixed(1)); // 0.5% per step, 0-100%
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

function decodeVoltage(value) {
    // Voltage decoding per Table 5.3 (16-bit, little-endian)
    if (value === 65535) {
        return "Not Available";
    } else if (value === 65534) {
        return "Reserved";
    } else if (value === 65533) {
        return "Out of Range";
    } else if (value === 65532) {
        return "Error";
    } else if (value <= 65530) {
        // Voltage in mV with 0.1V resolution
        return parseFloat((value * 0.1).toFixed(1)); // 0.1V per step
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

function decodeLockStatusMessage(dgn, data) {
    const result = {
        dgn: dgn,
        dgn_name: "LOCK_STATUS"
    };

    if (data.length < 6) {
        return { error: "Invalid data length for LOCK_STATUS - expected at least 6 bytes" };
    }

    // Byte 0: Instance
    result.instance = data[0];
    result.instance_name = decodeInstance(data[0]);

    // Byte 1: Lock Status (bits 0-1)
    const byte1 = data[1];
    const lockStatusRaw = decodeBits(byte1, 0, 1);
    result.lock_status = decodeLockStatus(lockStatusRaw);

    // Byte 2: Motion
    result.motion = decodeMotion(data[2]);

    // Byte 3: Position
    result.position = decodePosition(data[3]);

    // Bytes 4-5: Voltage (16-bit, little-endian)
    const voltageRaw = decodeUint16(data, 4);
    result.voltage = decodeVoltage(voltageRaw);

    // Raw values for debugging
    result.raw_instance = data[0];
    result.raw_byte1 = byte1;
    result.raw_lock_status = lockStatusRaw;
    result.raw_motion = data[2];
    result.raw_position = data[3];
    result.raw_voltage_bytes = data.length >= 6 ? [data[4], data[5]] : null;
    result.raw_voltage = voltageRaw;

    // Include additional bytes if present
    if (data.length > 6) {
        for (let i = 6; i < data.length; i++) {
            result[`raw_byte${i}`] = data[i];
        }
    }

    // Add convenience fields for Home Assistant integration
    result.is_locked = lockStatusRaw === 1;
    result.is_unlocked = lockStatusRaw === 0;
    result.is_moving = data[2] === 1 || data[2] === 2;
    result.is_opening = data[2] === 1;
    result.is_closing = data[2] === 2;
    result.is_stationary = data[2] === 0;

    // Position status (if available)
    if (typeof result.position === 'number') {
        result.position_percent = result.position;
        result.fully_open = result.position >= 99;
        result.fully_closed = result.position <= 1;
        result.partially_open = result.position > 1 && result.position < 99;
    } else {
        result.position_percent = null;
        result.fully_open = false;
        result.fully_closed = false;
        result.partially_open = false;
    }

    // Voltage status (if available)
    if (typeof result.voltage === 'number') {
        result.voltage_volts = result.voltage;
        result.low_voltage = result.voltage < 11.0; // Typical 12V system low voltage threshold
        result.high_voltage = result.voltage > 15.0; // Typical 12V system high voltage threshold
        result.normal_voltage = result.voltage >= 11.0 && result.voltage <= 15.0;
    } else {
        result.voltage_volts = null;
        result.low_voltage = false;
        result.high_voltage = false;
        result.normal_voltage = false;
    }

    // Validate instance - Lock valid instances are 0-250 (0 = broadcast/all locks)
    if (result.instance < 0 || result.instance > 250) {
        node.warn(`Invalid lock instance: ${result.instance} (${result.instance_name}) - message ignored`);
        return null;
    }

    // Lock and motion combination status
    result.locked_and_closed = result.is_locked && result.fully_closed;
    result.unlocked_and_open = result.is_unlocked && result.fully_open;
    result.secure_status = result.locked_and_closed ? "Secure" : "Not Secure";

    return result;
}

// === Main Logic ===

// Validate input payload
if (!msg.payload || typeof msg.payload !== 'object') {
    node.warn('Invalid payload: expected object');
    return null;
}

const incomingPayload = msg.payload;
const { dgn, data_payload } = incomingPayload;

if (!dgn || !data_payload) {
    node.warn('Missing required fields: dgn and/or data_payload');
    return null;
}

// Validate and convert hex payload to byte array
if (typeof data_payload !== 'string' || data_payload.length % 2 !== 0) {
    node.warn('Invalid data_payload: must be even-length hex string');
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

// Decode the LOCK_STATUS message
let decodedData;
if (dgn === '1FEE5') {
    decodedData = decodeLockStatusMessage(dgn, dataBytes);
} else {
    decodedData = { error: `Decoder for DGN ${dgn} is not implemented.` };
}

// Handle null return (invalid instance filtered out)
if (!decodedData) {
    return null;
}

// Handle decode errors
if (decodedData.error) {
    incomingPayload.decoding_error = decodedData.error;
    msg.payload = incomingPayload;
    return msg;
}

// Merge the incoming payload and the decoded data into a single flat object
msg.payload = {
    ...incomingPayload,
    ...decodedData
};

// Clean up the final object by removing the raw data field
delete msg.payload.data_payload;

return msg;