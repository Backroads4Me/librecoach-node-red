// Decodes GENERATOR_AC_STATUS_1 messages (1FFDF)
// Instance byte §6.18.2: bits 0-3 = Output Instance, bits 4-7 = Line

// === Helper Functions ===

function decodeBits(value, startBit, endBit) {
  const mask = ((1 << (endBit - startBit + 1)) - 1) << startBit;
  return (value & mask) >> startBit;
}

// === GENERATOR_AC_STATUS Specific Decoders ===

function decodeOutputInstance(byte0) {
  // §6.18.2: bits 0-3 = Output Instance (valid: 1-10; 0 and 11-15 = invalid)
  const outputInstance = byte0 & 0x0f;
  return outputInstance >= 1 && outputInstance <= 10 ? outputInstance : null;
}

function decodeLine(byte0) {
  // §6.18.2: bits 4-7 = Line (1 = Line 1, 2 = Line 2)
  const line = (byte0 >> 4) & 0x0f;
  return line === 1 || line === 2 ? line : null;
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
  // AC RMS current (Table 5.3 - uint16, 0.05A/bit, -1600A offset)
  if (value <= 65530) {
    return parseFloat((value * 0.05 - 1600).toFixed(2));
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
  // Decode fault bits from byte 7
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

function decodeGeneratorACMessage(dgn, dgn_name, data) {
  const result = {
    dgn: dgn,
    dgn_name: dgn_name,
  };

  // Only GENERATOR_AC_STATUS_1 (1FFDF) carries voltage/current/frequency.
  // STATUS_2/3/4 have different byte layouts (power, harmonics, etc.).
  if (dgn !== "1FFDF") {
    result.error = `Byte layout not implemented for ${dgn_name} (${dgn})`;
    return result;
  }

  // Decode based on AC_STATUS_1 format (8 bytes)
  if (data.length >= 8) {
    // Byte 0: Output Instance (bits 0-3) and Line (bits 4-7) per §6.18.2
    result.output_instance = decodeOutputInstance(data[0]);
    result.line = decodeLine(data[0]);
    result.raw_instance_byte = data[0];

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
    const faultInfo = decodeFaultBits(data[7]);
    result.fault_status = faultInfo.faults;
    result.open_ground = faultInfo.open_ground;
    result.open_neutral = faultInfo.open_neutral;
    result.reverse_polarity = faultInfo.reverse_polarity;
    result.ground_current_fault = faultInfo.ground_current_fault;
    result.any_fault = faultInfo.any_fault;

    // Raw values for debugging
    result.raw_voltage = voltageRaw;
    result.raw_current = currentRaw;
    result.raw_frequency = frequencyRaw;
    result.raw_fault_byte = data[7];
  }

  // Add convenience fields
  result.ac_output_active =
    result.rms_voltage !== "Not Available" &&
    typeof result.rms_voltage === "number" &&
    result.rms_voltage > 50; // Reasonable AC voltage threshold

  result.generator_loaded =
    result.rms_current !== "Not Available" &&
    typeof result.rms_current === "number" &&
    result.rms_current > 0.1; // Some current flow

  result.generator_ac_available = result.ac_output_active && !result.any_fault;

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

// Decode the GENERATOR_AC_STATUS message (only STATUS_1 / 1FFDF supported)
const decodedData = decodeGeneratorACMessage(dgn, dgn_name, dataBytes);

// Silently drop unsupported DGN variants (STATUS_2/3/4)
if (decodedData.error) {
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
