// Status Updater for Floor Heat
// Decodes FLOOR_HEAT_STATUS messages (1FEFC)

function decodeFloorHeatInstance(value) {
  // Per Table 5.3 (Standard_Physical_Units.pdf, pg 2)
  if (value === 0) {
    return "all"; //
  } else if (value <= 250) {
    return value; // Direct instance number
  } else if (value === 254) {
    return "Out of range / not configured"; //
  } else if (value === 255) {
    return "Data not available"; //
  }
  // Values 251-253 are not defined in this standard
  return "Reserved/Invalid";
}

// Decodes Operating Mode from Byte 1, Bits 0-1
function decodeOperatingMode(value) {
  const modes = {
    0: "Automatic", // 00b
    1: "Manual", // 01b
  };
  return modes[value] || "Reserved";
}

// Decodes Operating Status from Byte 1, Bits 2-3
function decodeOperatingStatus(value) {
  const states = {
    0: "Off", // 00b
    1: "On", // 01b
  };
  return states[value] || "Reserved";
}

// Decodes Heat Element Status from Byte 1, Bits 4-5
function decodeHeatElementStatus(value) {
  const states = {
    0: "Off", // 00b
    1: "On", // 01b
  };
  return states[value] || "Reserved";
}

// Decodes Schedule Mode from Byte 1, Bits 6-7
function decodeScheduleMode(value) {
  const modes = {
    0: "Disabled", // 00b
    1: "Enabled", // 01b
  };
  return modes[value] || "Reserved";
}

//Decodes a standard RV-C temperature value (uint16).
// Uses 0.03125°C resolution (per RVC spec) with -273.15°C offset (Kelvin).
function decodeTemperature(value, isCelsius = false) {
  if (value === 0) {
    return "Not Available";
  } else if (value <= 65530) {
    const tempK = value * 0.03125; // Kelvin
    const tempC = tempK - 273.15; // Convert to Celsius

    if (isCelsius) {
      return parseFloat(tempC.toFixed(1));
    } else {
      // Convert to Fahrenheit: F = C * 9/5 + 32
      return parseFloat(((tempC * 9) / 5 + 32).toFixed(1));
    }
  } else if (value === 65533) {
    return "Out of Range";
  } else if (value === 65534) {
    return "Reserved";
  } else if (value === 65535) {
    return "Not Available";
  }
  return "Invalid";
}

// Decodes the dead band value from Byte 6.
function decodeDeadband(value) {
  // Spec: Precision = 0.1°C, Value range = 0.0 to 25.0°C
  if (value <= 250) {
    return parseFloat((value * 0.1).toFixed(1)); // 0.1°C
  } else if (value === 251) {
    return "Error";
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

function decodeFloorHeatMessage(dgn, data) {
  const result = {
    dgn: dgn,
    dgn_name: "FLOOR_HEAT_STATUS",
  };

  // Spec defines 7 bytes (0-6)
  if (data.length < 7) {
    result.decoding_error = "Payload too short. Expected 7 bytes for 1FEFCh.";
    return result; // Return error object to allow debugging
  }

  // Byte 0: Instance
  result.instance = decodeFloorHeatInstance(data[0]);
  result.raw_instance = data[0];

  // Check if the instance is a valid number.
  // If it's a string ("all", "Data not available", etc.), return null to filter.
  if (typeof result.instance !== "number") {
    //node.warn(`Message filtered: Instance is not a valid number (${result.instance}).`);
    return null;
  }

  // Byte 1: Bit-packed fields
  const byte1 = data[1];
  result.operating_mode = decodeOperatingMode(byte1 & 0x03); // Bits 0-1
  result.operating_status = decodeOperatingStatus((byte1 >> 2) & 0x03); // Bits 2-3
  result.heat_element_status = decodeHeatElementStatus((byte1 >> 4) & 0x03); // Bits 4-5
  result.schedule_mode = decodeScheduleMode((byte1 >> 6) & 0x03); // Bits 6-7
  result.raw_byte1 = byte1;

  // Bytes 2-3: Measured Temperature (uint16, little-endian)
  const tempRaw = data[2] | (data[3] << 8);
  result.measured_temperature = decodeTemperature(tempRaw);
  result.raw_temperature = tempRaw;

  // Bytes 4-5: Set Point (uint16, little-endian)
  const setpointRaw = data[4] | (data[5] << 8);
  // Use the same decodeTemperature function for the set point
  result.set_point = decodeTemperature(setpointRaw);
  result.raw_setpoint = setpointRaw;

  // Byte 6: Dead band (uint8)
  result.dead_band_c = decodeDeadband(data[6]);
  result.raw_dead_band = data[6];

  // Byte 7: Not defined in the spec table
  if (data.length > 7) {
    result.raw_byte7 = data[7];
  }

  // Add convenience fields
  result.floor_heat_on = result.operating_status === "On";
  result.heating_active = result.heat_element_status === "On";
  result.floor_heat_available =
    result.instance !== "Not Available" &&
    result.instance !== "Error" &&
    result.instance !== "Not Supported";

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

// Decode the FLOOR_HEAT_STATUS message
const decodedData = decodeFloorHeatMessage(dgn, dataBytes);

// If decodeFloorHeatMessage returned null (e.g., invalid instance),
// stop the flow here by returning null.
if (decodedData === null) {
  return null;
}

// Merge the incoming payload and the decoded data into a single flat object
msg.payload = {
  ...incomingPayload,
  ...decodedData,
};

// Clean up the final object by removing the raw data field
delete msg.payload.data_payload;

return msg;
