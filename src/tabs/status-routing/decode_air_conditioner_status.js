// Status Updater for Air Conditioner
// Decodes AIR_CONDITIONER_STATUS messages (1FFE1)

// === Helper Functions ===

function decodeOperatingMode(value) {
  // Operating mode mapping
  const modes = {
    0: "Automatic",
    1: "Manual",
    255: "Not Available",
  };
  return modes[value] || `Unknown (${value})`;
}

function decodePercentage(value) {
  // Percentage decoding: 0.5% per count, range 0-100%
  if (value <= 200) {
    return parseFloat((value * 0.5).toFixed(1));
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

function decodeDeadband(value) {
  // Dead band: 0.1°C precision, range 0-25.0°C
  if (value <= 250) {
    return parseFloat((value * 0.1).toFixed(1));
  } else if (value === 255) {
    return "Not Available";
  }
  return "Invalid";
}

function decodeInstance(value) {
  // Instance decoding per Table 5.3
  if (value === 0) {
    return 0; // All instances / Auto fan speed
  } else if (value >= 1 && value <= 250) {
    return value;
  } else if (value === 255) {
    return "Not Available";
  }
  return "Invalid";
}

// === Main Decode Function ===

function decodeAirConditionerStatusMessage(dgn, data) {
  const result = {
    dgn: dgn,
    dgn_name: "AIR_CONDITIONER_STATUS",
  };

  if (data.length < 6) {
    result.error = "Data payload too short (expected at least 6 bytes)";
    return result;
  }

  // Byte 0: Instance (Zone)
  result.instance = decodeInstance(data[0]);
  if (typeof result.instance === "number") {
    result.instance_description =
      result.instance === 0 ? "All zones" : `Zone ${result.instance}`;
  } else {
    result.instance_description = result.instance;
  }

  // Byte 1: Operating Mode
  result.operating_mode = decodeOperatingMode(data[1]);
  result.is_automatic = data[1] === 0;
  result.is_manual = data[1] === 1;

  // Byte 2: Max Fan Speed (%)
  result.max_fan_speed = decodePercentage(data[2]);
  result.max_fan_speed_limited =
    typeof result.max_fan_speed === "number" && result.max_fan_speed < 100;

  // Byte 3: Max AC Output Level (%)
  result.max_ac_output_level = decodePercentage(data[3]);
  result.max_output_limited =
    typeof result.max_ac_output_level === "number" &&
    result.max_ac_output_level < 100;

  // Byte 4: Fan Speed (%)
  result.fan_speed = decodePercentage(data[4]);
  result.fan_running =
    typeof result.fan_speed === "number" && result.fan_speed > 0;

  // Byte 5: AC Output Level (%)
  result.ac_output_level = decodePercentage(data[5]);
  result.compressor_running =
    typeof result.ac_output_level === "number" && result.ac_output_level > 0;

  // Byte 6: Dead Band (optional)
  if (data.length >= 7) {
    result.dead_band = decodeDeadband(data[6]);
    result.dead_band_unit = "°C";
  }

  // Byte 7: Second Stage Dead Band (optional)
  if (data.length >= 8) {
    result.second_stage_dead_band = decodeDeadband(data[7]);
    result.second_stage_dead_band_unit = "°C";
  }

  // Convenience fields
  result.ac_active = result.compressor_running;
  result.status = result.compressor_running
    ? "COOLING"
    : result.fan_running
      ? "FAN ONLY"
      : "OFF";

  // Power sharing status
  result.power_limited =
    result.max_fan_speed_limited || result.max_output_limited;

  // Raw values for debugging
  result.raw_instance = data[0];
  result.raw_operating_mode = data[1];
  result.raw_max_fan_speed = data[2];
  result.raw_max_ac_output_level = data[3];
  result.raw_fan_speed = data[4];
  result.raw_ac_output_level = data[5];
  if (data.length >= 7) result.raw_dead_band = data[6];
  if (data.length >= 8) result.raw_second_stage_dead_band = data[7];

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

// Decode the AIR_CONDITIONER_STATUS message
const decodedData = decodeAirConditionerStatusMessage(dgn, dataBytes);

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
