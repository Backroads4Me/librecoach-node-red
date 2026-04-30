// Decoder for Proprietary AquaHot _2 DGNs:
// FF01 (AQUAHOT_THERMOSTAT_STATUS_2), FF2F (AQUAHOT_COMMAND_2), FF2E (AQUAHOT_SYSTEM_STATUS_2), 6C00 (AQUAHOT_STATUS_2)
//
// Note: These are NOT part of the standard RV-C specification. Decoding is based on
// reverse-engineered analysis of recordings. Confidence levels differ per field.

function decodeUint16(data, startByte) {
    return data[startByte] | (data[startByte + 1] << 8);
}

// === AQUAHOT_THERMOSTAT_STATUS_2 (FF01) ===
function decodeZoneThermostat(data, result) {
    // Byte 0: Zone Index [HIGH confidence] (00=Zone 1, 01=Zone 2)
    result.zone_index = data[0];
    result.raw_zone_index = data[0];

    // Byte 1: Sub-Index [HIGH confidence] (01=primary, 02=secondary, FF=summary)
    result.sub_index = data[1];

    // Byte 2: Config/Capability Byte [MEDIUM confidence]
    result.config_byte = data[2];

    // Byte 3: Unknown [LOW confidence] (always 0x01 in recordings)
    result.unknown_byte3 = data[3];

    // Byte 4: Status/Mode [MEDIUM confidence]
    result.status_mode = data[4];

    // Byte 5: Unknown [LOW confidence]
    result.unknown_byte5 = data[5];

    // Byte 6: Temperature [HIGH confidence for sub-index 01, °F]
    if (data[1] === 0x01 && data[6] !== 0xff) {
        result.zone_temperature = data[6];
    }
    result.raw_temperature = data[6];

    // Byte 7: Unknown [LOW confidence]
    result.unknown_byte7 = data[7];
}

// === AQUAHOT_COMMAND_2 (FF2F) ===
function decodeCommand(data, result) {
    // Byte 0: Instance [HIGH confidence] (Always 0x01)
    result.instance = data[0];

    // Byte 1: Command Type [HIGH confidence]
    //   0x07 = Zone Control (observed during zone OFF events from 0x9E)
    //   0x0A = Burner Control (observed during burner on/off from 0x9E)
    result.command_type = data[1];
    if (data[1] === 0x07) {
        result.command_name = "Zone Control";
    } else if (data[1] === 0x0a) {
        result.command_name = "Burner Control";
    } else {
        result.command_name = `Unknown (0x${data[1].toString(16)})`;
    }

    // Byte 2: Reserved [HIGH confidence] (Always 0x00)

    // Byte 3: Meaning depends on command type
    result.value_raw = data[3];
    if (data[1] === 0x07) {
        // Zone Control: byte 3 = zone index (0-based)
        // Only observed during zone OFF events; on/off may be implicit in the command type
        // Observed values: 0 and 1 on a 2-zone system; other systems may have more
        result.zone_id = data[3];
    } else if (data[1] === 0x0a) {
        // Burner Control: byte 3 = on/off (0x01=On, 0x00=Off)
        result.is_on = data[3] === 0x01;
    }

    // Bytes 4-7: Reserved/Padding [HIGH confidence]
}

// === AQUAHOT_STATUS_2 (6C00) ===
function decodeStatus(data, result) {
    // Byte 0: Instance [HIGH confidence] (0xFF = all zones)
    result.instance = data[0];

    // Byte 1: Sub-Index [HIGH confidence]
    result.sub_index = data[1];

    // Bytes 2–5: Values [LOW confidence]
    result.value_a = data[2];
    result.value_b = data[3];
    result.value_c = data[4];
    result.value_d = data[5];
}

// === AQUAHOT_SYSTEM_STATUS_2 (FF2E) ===
function decodeSystemStatus(data, result) {
    // Byte 0: Instance [HIGH confidence] (Always 0x01)
    result.instance = data[0];

    // Byte 1: Sub-Index [HIGH confidence] (0x00 through 0x0B observed)
    result.sub_index = data[1];

    // Byte 2: Reserved [HIGH confidence] (Always 0xFF)

    // Byte 3: Value (primary) [MEDIUM confidence]
    result.primary_value = data[3];

    // Bytes 4-5: Value (secondary) [LOW confidence]
    result.secondary_value = decodeUint16(data, 4);

    // Bytes 6-7: Padding [HIGH confidence] (0xFF 0xFF)
}

// === Main Decode Function ===

function decodeAquaHotZone(dgn, dgn_name, data) {
    const result = {
        dgn: dgn,
        dgn_name: dgn_name,
    };

    if (data.length < 8) {
        result.error = "Data payload too short (expected 8 bytes)";
        return result;
    }

    // Include raw data for all proprietary analysis
    result.raw_byte0 = data[0];
    result.raw_byte1 = data[1];
    result.raw_byte2 = data[2];
    result.raw_byte3 = data[3];
    result.raw_byte4 = data[4];
    result.raw_byte5 = data[5];
    result.raw_byte6 = data[6];
    result.raw_byte7 = data[7];

    if (dgn_name === "AQUAHOT_THERMOSTAT_STATUS_2") {
        decodeZoneThermostat(data, result);
    } else if (dgn_name === "AQUAHOT_COMMAND_2") {
        decodeCommand(data, result);
    } else if (dgn_name === "AQUAHOT_SYSTEM_STATUS_2") {
        decodeSystemStatus(data, result);
    } else if (dgn_name === "AQUAHOT_STATUS_2") {
        decodeStatus(data, result);
    } else {
        result.error = `Unhandled AquaHot DGN: ${dgn_name}`;
    }

    return result;
}

// === Node-RED Parsing ===

if (!msg.payload || typeof msg.payload !== "object") {
    node.warn("Invalid payload: expected object");
    return null;
}

const incomingPayload = msg.payload;
const { dgn, dgn_name, data_payload } = incomingPayload;

if (!dgn || !dgn_name || !data_payload) {
    node.warn("Missing required fields: dgn, dgn_name, data_payload");
    return null;
}

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

const decodedData = decodeAquaHotZone(dgn, dgn_name, dataBytes);

if (decodedData.error) {
    incomingPayload.decoding_error = decodedData.error;
    msg.payload = incomingPayload;
    return msg;
}

// Merge the incoming payload and the decoded data
msg.payload = {
    ...incomingPayload,
    ...decodedData,
};

delete msg.payload.data_payload;

return msg;
