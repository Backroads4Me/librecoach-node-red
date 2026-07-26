// Status Updater for Inverter DC
// Decodes INVERTER_DC_STATUS messages

// === Helper Functions ===

function decodeBits(value, startBit, endBit) {
  const mask = ((1 << (endBit - startBit + 1)) - 1) << startBit;
  return (value & mask) >> startBit;
}

// === INVERTER_DC_STATUS Specific Decoders ===

function decodeInverterInstance(value) {
  // Inverter instance interpretation
  if (value <= 200) {
    return value; // Direct instance number
  } else if (value === 251) {
    return "Error";
  } else if (value === 252) {
    return "Not Supported";
  } else if (value === 253) {
    return "Reserved";
  } else if (value === 254) {
    return "Out of Range";
  } else if (value === 255) {
    return "Not Available";
  }
  return "Invalid";
}

function decodeDCVoltage(value) {
  // DC Voltage in volts (0.05V resolution)
  if (value <= 64000) {
    return parseFloat((value * 0.05).toFixed(2)); // 0.05V per step
  } else if (value === 65533) {
    return "Reserved";
  } else if (value === 65534) {
    return "Out of Range";
  } else if (value === 65535) {
    return "Not Available";
  }
  return "Invalid";
}

// RV-C Table 5.3 — amperage, uint16: 0.05 A/bit, offset-encoded with 0 A at
// raw 0x7D00 (32000). Range -1600 to 1612.5 A. NOT two's complement —
// negative current (charging/import) is a raw value below 32000.
// Special values per Table 3.2.3b.
function decodeDCCurrent(raw) {
  if (raw === 65535) return "Not Available";
  if (raw === 65534) return "Out of Range";
  if (raw === 65533) return "Reserved";

  const amps = raw * 0.05 - 1600;
  if (amps < -1600 || amps > 1612.5) return "Invalid";

  return parseFloat(amps.toFixed(2));
}

function decodeTemperature(value) {
  // Temperature: uint8, offset -40°C, output °F
  if (value <= 210) {
    const tempC = value - 40; // -40°C to +170°C range
    return parseFloat(((tempC * 9) / 5 + 32).toFixed(1));
  } else if (value === 251) {
    return "Error";
  } else if (value === 252) {
    return "Not Supported";
  } else if (value === 253) {
    return "Reserved";
  } else if (value === 254) {
    return "Out of Range";
  } else if (value === 255) {
    return "Not Available";
  }
  return "Invalid";
}

function decodeInverterState(value) {
  // Inverter operational state
  const states = {
    0: "Off",
    1: "Starting",
    2: "Running",
    3: "Stopping",
    4: "Sleep Mode",
    5: "Search Mode",
    6: "Standby",
    7: "Fault",
    8: "Battery Low",
    9: "Overload",
    251: "Error",
    252: "Not Supported",
    253: "Out of Range",
    254: "Reserved",
    255: "Not Available",
  };

  return states[value] || `Unknown State ${value}`;
}

function decodeUint16(data, startByte) {
  // Decode 16-bit value (little-endian)
  if (!data || startByte + 1 >= data.length) {
    return 65535; // Not available
  }
  return data[startByte] | (data[startByte + 1] << 8);
}

// === Main Decode Function ===

function decodeInverterDCMessage(dgn, data) {
  const result = {
    dgn: dgn,
    dgn_name: "INVERTER_DC_STATUS",
  };

  // INVERTER_DC_STATUS (RV-C): byte 0 instance, 1-2 voltage, 3-4 amperage
  if (data.length >= 5) {
    // Byte 0: Inverter Instance
    result.instance = decodeInverterInstance(data[0]);

    // Bytes 1-2: DC Voltage (uint16, little-endian)
    const voltageRaw = decodeUint16(data, 1);
    result.dc_voltage = decodeDCVoltage(voltageRaw);

    // Bytes 3-4: DC Amperage (uint16, little-endian)
    const currentRaw = decodeUint16(data, 3);
    result.dc_current = decodeDCCurrent(currentRaw);

    // Raw values for debugging
    result.raw_instance = data[0];
    result.raw_voltage = voltageRaw;
    result.raw_current = currentRaw;
  }

  // Convenience booleans
  result.dc_input_available =
    typeof result.dc_voltage === "number" && result.dc_voltage > 10;
  result.inverter_drawing_power =
    typeof result.dc_current === "number" && Math.abs(result.dc_current) > 0.5;

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

// Decode the INVERTER_DC_STATUS message
const decodedData = decodeInverterDCMessage(dgn, dataBytes);

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
