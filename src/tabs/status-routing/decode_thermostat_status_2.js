// Status Updater for Thermostat Ext
// Decodes THERMOSTAT_STATUS_2 messages (1FEE0)

// === Helper Functions ===

function decodeBits(value, startBit, endBit) {
  const mask = ((1 << (endBit - startBit + 1)) - 1) << startBit;
  return (value & mask) >> startBit;
}

// === THERMOSTAT_STATUS_2 Specific Decoders ===

function decodeThermostatInstance(value) {
  // Thermostat instance mapping
  if (value <= 200) {
    return value; // Direct instance number (Zone)
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

function decodeCurrentScheduleInstance(value) {
  // Current schedule instance — spec says uint8 instance, no labeled values defined
  if (value === 255) return null;
  return value; // Plain instance number
}

function decodeScheduleInstances(value) {
  // Number of schedule instances capacity
  if (value <= 200) {
    return value; // Direct count
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

// === Main Decode Function ===

function decodeThermostatStatus2Message(dgn, data) {
  const result = {
    dgn: dgn,
    dgn_name: "THERMOSTAT_STATUS_2",
  };

  // Decode based on THERMOSTAT_STATUS_2 format (typically 4-8 bytes)
  if (data.length > 0) {
    // Byte 0: Instance (Zone)
    result.instance = decodeThermostatInstance(data[0]);

    // Byte 1: Current Schedule Instance
    if (data.length > 1) {
      result.current_schedule_instance = decodeCurrentScheduleInstance(data[1]);
    }

    // Byte 2: Number of Schedule Instances
    if (data.length > 2) {
      result.number_of_schedule_instances = decodeScheduleInstances(data[2]);
    }

    // Byte 3: Feature flags (bit fields per §6.16.3)
    if (data.length > 3) {
      const b3 = data[3];
      const noiseVal = b3 & 0x03; // bits 0-1
      const ecoVal = (b3 >> 2) & 0x03; // bits 2-3
      const turboVal = (b3 >> 4) & 0x03; // bits 4-5

      result.reduced_noise_mode =
        noiseVal === 3 ? null : noiseVal === 1 ? "Enabled" : "Disabled";
      result.eco_mode =
        ecoVal === 3 ? null : ecoVal === 1 ? "Enabled" : "Disabled";
      result.turbo_mode =
        turboVal === 3 ? null : turboVal === 1 ? "Enabled" : "Disabled";
      result.raw_b3 = b3;
    }

    // Raw values for debugging
    result.raw_instance = data[0];
    if (data.length > 1) result.raw_current_schedule = data[1];
    if (data.length > 2) result.raw_schedule_count = data[2];
    if (data.length > 3) result.raw_features_byte = data[3];
    if (data.length > 4) result.raw_byte_4 = data[4];
    if (data.length > 5) result.raw_byte_5 = data[5];
    if (data.length > 6) result.raw_byte_6 = data[6];
    if (data.length > 7) result.raw_byte_7 = data[7];
  }

  // Convenience booleans
  result.quiet_mode_active = result.reduced_noise_mode === "Enabled";
  result.eco_mode_active = result.eco_mode === "Enabled";
  result.turbo_mode_active = result.turbo_mode === "Enabled";

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

// Decode the THERMOSTAT_STATUS_2 message
const decodedData = decodeThermostatStatus2Message(dgn, dataBytes);

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
