// Status Updater for Tank
// Decodes TANK_STATUS messages (1FFB7)

// === Helper Functions ===

function decodeBits(value, startBit, endBit) {
  const mask = ((1 << (endBit - startBit + 1)) - 1) << startBit;
  return (value & mask) >> startBit;
}

// === TANK_STATUS Specific Decoders ===

function decodeTankInstance(value) {
  // Tank instance mapping — per RV-C spec section 6.28 (TANK_STATUS, PGN 1FFB7)
  const tankTypes = {
    0: "Fresh Water",
    1: "Black Water",
    2: "Gray Water",
    3: "LPG",
    16: "Fresh Water 2",
    17: "Black Water 2",
    18: "Gray Water 2",
    19: "LPG 2",
  };

  return tankTypes[value] || `Unknown Tank ${value}`;
}

function decodeTankLevel(value) {
  // Tank level as raw sensor reading (not percentage)
  // Percentage calculated as: (relative_level / resolution) * 100
  if (value <= 250) {
    return value; // Raw sensor reading
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

function decodeTankResolution(value) {
  // Tank resolution as raw sensor resolution value
  // Used in calculation: (relative_level / resolution) * 100
  if (value <= 250) {
    return value; // Raw resolution value
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

function decodeTemperature(value) {
  // Temperature in Celsius, offset -40°C
  if (value <= 210) {
    return value - 40; // -40°C to +170°C range
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

function decodeTankStatus(value) {
  // Tank status bit field decoding
  const statusBits = {
    0: "Tank OK",
    1: "Tank Low",
    2: "Tank Full",
    3: "Tank Overfilled",
    4: "Sensor Fault",
    5: "Tank Disconnected",
    6: "Reserved",
    7: "Reserved",
  };

  const activeStatuses = [];
  for (let bit = 0; bit < 8; bit++) {
    if (value & (1 << bit)) {
      activeStatuses.push(statusBits[bit]);
    }
  }

  return activeStatuses.length > 0 ? activeStatuses.join(", ") : "Tank OK";
}

// === Main Decode Function ===

function decodeTankStatusMessage(dgn, data) {
  const result = {
    dgn: dgn,
    dgn_name: "TANK_STATUS",
  };

  // Decode based on TANK_STATUS format (8 bytes typical)
  if (data.length >= 8) {
    // Byte 0: Tank Instance
    result.instance = data[0];
    result.instance_name = decodeTankInstance(data[0]);

    // Byte 1: Relative Level (0-200)
    result.relative_level = decodeTankLevel(data[1]);

    // Byte 2: Resolution (tank capacity steps)
    result.resolution = decodeTankResolution(data[2]);

    // Byte 3: Temperature
    result.temperature = decodeTemperature(data[3]);

    // Byte 4: Tank Status (bit field)
    result.status = decodeTankStatus(data[4]);

    // Bytes 5-7: Reserved/Future use
    // Currently set to 0xFF in most implementations

    // Raw values for debugging
    result.raw_instance = data[0];
    result.raw_relative_level = data[1];
    result.raw_resolution = data[2];
    result.raw_temperature = data[3];
    result.raw_status = data[4];
    if (data.length > 5) result.raw_byte_5 = data[5];
    if (data.length > 6) result.raw_byte_6 = data[6];
    if (data.length > 7) result.raw_byte_7 = data[7];

    // If relative_level is 0xFF (Not Available), the tank has no physical sensor
    // or doesn't exist on this coach. Drop the message to prevent phantom entity creation.
    if (data[1] === 0xff) {
      return null;
    }
  }

  // Add convenience fields for easier consumption
  // Calculate tank percentage using RV-C formula: (relative_level / resolution) * 100
  if (
    result.relative_level !== undefined &&
    result.resolution !== undefined &&
    typeof result.relative_level === "number" &&
    typeof result.resolution === "number" &&
    result.resolution > 0
  ) {
    result.level_percentage = Math.round(
      (result.relative_level / result.resolution) * 100,
    );
  } else if (
    result.relative_level !== undefined &&
    typeof result.relative_level === "number"
  ) {
    // Fallback if resolution is not available (direct percentage)
    result.level_percentage = Math.round(result.relative_level * 0.5); // 0.5% per step
  }

  if (result.instance !== undefined) {
    // Map numeric instance to single-word tank type — strictly per RV-C spec section 6.28
    const tankTypeMap = {
      0: "fresh",
      1: "black",
      2: "gray",
      3: "lpg",
      16: "fresh2",
      17: "black2",
      18: "gray2",
      19: "lpg2",
    };

    result.tank_type =
      tankTypeMap[result.instance] ?? `other_${result.instance}`;
  }

  // Tank level status
  if (typeof result.level_percentage === "number") {
    result.tank_empty = result.level_percentage <= 5;
    result.tank_low = result.level_percentage <= 25;
    result.tank_full = result.level_percentage >= 95;
    result.tank_level_available = true;
  } else {
    result.tank_level_available = false;
  }

  // Validate instance — only spec-defined instances pass through
  // RV-C section 6.28 defines exactly: 0-3 and 16-19
  // Values 251-255 are RV-C special status values (not real tanks)
  const validInstances = new Set([0, 1, 2, 3, 16, 17, 18, 19]);

  if (result.instance > 250) {
    // Silently drop RV-C special status values (251-255)
    return null;
  }

  if (!validInstances.has(result.instance)) {
    node.warn(
      `Unknown tank instance: ${result.instance} — passing through as other_${result.instance}`,
    );
    // Don't return null — let unknown instances through as "other_N" for user visibility
  }

  // Temperature status
  result.temperature_available = typeof result.temperature === "number";

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

// Decode the TANK_STATUS message
const decodedData = decodeTankStatusMessage(dgn, dataBytes);

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
  ...decodedData,
};

// Clean up the final object by removing the raw data field
delete msg.payload.data_payload;

return msg;
