// Decodes FURNACE_STATUS messages (1FFE4)
// RV-C spec 6.15.2

// === Helper Functions ===

function decodeBits(value, startBit, endBit) {
  const mask = ((1 << (endBit - startBit + 1)) - 1) << startBit;
  return (value & mask) >> startBit;
}

function decodeOperatingMode(value) {
  const modes = {
    0: "Auto",
    1: "Manual",
    2: "Reserved",
    3: "Not Available",
  };
  return modes[value] || `Unknown (${value})`;
}

function decodeHeatSource(value) {
  const sources = {
    0: "Combustion",
    1: "AC Primary",
    2: "AC Secondary",
    3: "Engine",
    4: "Hydronic Combustion",
    5: "Hydronic Electric",
    6: "Hydronic Both",
  };
  // Handle standard RV-C default/missing values beyond the 6 values defined
  if (value === 0x3e) return "Reserved";
  if (value === 0x3f) return "Not Available";
  return sources[value] || `Unknown (${value})`;
}

function decodePercentage(value, step = 1) {
  if (value <= 250) {
    return parseFloat((value * step).toFixed(2));
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
  if (value <= 250) {
    return parseFloat((value * 0.1).toFixed(1)); // 0.1°C step
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

function decodeWarning(value) {
  const statuses = {
    0: "Normal",
    1: "Warning",
    2: "Reserved",
    3: "Not Available",
  };
  return statuses[value] || `Unknown (${value})`;
}

function decodeStatusFlag(value) {
  const statuses = {
    0: "Inactive",
    1: "Active",
    2: "Reserved",
    3: "Not Available",
  };
  return statuses[value] || `Unknown (${value})`;
}

// === Main Decode Function ===

function decodeFurnaceStatusMessage(dgn, data) {
  const result = {
    dgn: dgn,
    dgn_name: "FURNACE_STATUS",
  };

  if (data.length < 8) {
    result.error = "Data payload too short (expected 8 bytes)";
    return result;
  }

  // Byte 0: Instance
  result.instance = data[0];
  result.raw_instance = data[0];

  // Byte 1: Operating Mode (bits 0-1), Heat Source (bits 2-7)
  const byte1 = data[1];
  const operatingModeRaw = decodeBits(byte1, 0, 1);
  result.operating_mode = decodeOperatingMode(operatingModeRaw);
  result.raw_operating_mode = operatingModeRaw;

  const heatSourceRaw = decodeBits(byte1, 2, 7);
  result.heat_source = decodeHeatSource(heatSourceRaw);
  result.raw_heat_source = heatSourceRaw;

  // Byte 2: Circulation Fan Speed (0.5%/step)
  result.circulation_fan_speed = decodePercentage(data[2], 0.5);
  result.raw_circulation_fan_speed = data[2];

  // Byte 3: Heat Output Level (1%/step)
  result.heat_output_level = decodePercentage(data[3], 1.0);
  result.raw_heat_output_level = data[3];

  // Byte 4: Dead Band (0.1°C)
  result.dead_band = decodeDeadband(data[4]);
  result.raw_dead_band = data[4];

  // Byte 5: Second Stage Dead Band (0.1°C)
  result.second_stage_dead_band = decodeDeadband(data[5]);
  result.raw_second_stage_dead_band = data[5];

  // Byte 6: Faults
  const byte6 = data[6];
  const overcurrentRaw = decodeBits(byte6, 0, 1);
  result.overcurrent = decodeWarning(overcurrentRaw);

  const undercurrentRaw = decodeBits(byte6, 2, 3);
  result.undercurrent = decodeWarning(undercurrentRaw);

  const tempWarningRaw = decodeBits(byte6, 4, 5);
  result.temperature_warning = decodeWarning(tempWarningRaw);

  const analogInputRaw = decodeBits(byte6, 6, 7);
  result.analog_input_active = decodeStatusFlag(analogInputRaw);

  result.raw_byte6 = byte6;

  // Convenience fields
  result.is_hydronic =
    typeof heatSourceRaw === "number" &&
    heatSourceRaw >= 4 &&
    heatSourceRaw <= 6;

  result.furnace_active =
    (typeof result.circulation_fan_speed === "number" &&
      result.circulation_fan_speed > 0) ||
    (typeof result.heat_output_level === "number" &&
      result.heat_output_level > 0);

  result.has_fault =
    result.overcurrent === "Warning" ||
    result.undercurrent === "Warning" ||
    result.temperature_warning === "Warning";

  return result;
}

// === Main Logic ===

// Validate input payload
if (!msg.payload || typeof msg.payload !== "object") {
  node.warn("Invalid payload: expected object");
  return null;
}

const incomingPayload = msg.payload;
const { dgn, dgn_name, data_payload } = incomingPayload;

if (!dgn || !dgn_name || !data_payload) {
  node.warn("Missing required fields: dgn, dgn_name, and/or data_payload");
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

// Decode the message
const decodedData = decodeFurnaceStatusMessage(dgn, dataBytes);

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
