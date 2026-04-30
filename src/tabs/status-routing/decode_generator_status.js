// Decodes GENERATOR_STATUS_1 (1FFDC) and GENERATOR_STATUS_2 (1FFDB) messages
// RV-C spec 6.18.23 and 6.18.24

// === Helper Functions ===

function decodeBits(value, startBit, endBit) {
  const mask = ((1 << (endBit - startBit + 1)) - 1) << startBit;
  return (value & mask) >> startBit;
}

function decodeUint16(data, startByte) {
  return data[startByte] | (data[startByte + 1] << 8);
}

function decodeUint32(data, startByte) {
  return (
    data[startByte] |
    (data[startByte + 1] << 8) |
    (data[startByte + 2] << 16) |
    (data[startByte + 3] << 24)
  );
}

// === GENERATOR_STATUS Specific Decoders ===

// RV-C Table 5.3 uint2 indicator
const BIT2_STATES = {
  0: "Not Active",
  1: "Active",
  2: "Error",
  3: "Not Available",
};

// STATUS_1 - Byte 0: Operational status (§6.18.23)
function decodeGeneratorStatus(value) {
  const states = {
    0: "Stopped",
    1: "Preheat",
    2: "Cranking",
    3: "Running",
    4: "Priming",
    5: "Fault",
    6: "Engine Run Only",
    7: "Test Mode",
    8: "Voltage Adjust Mode",
    9: "Fault Bypass Mode",
    10: "Configuration Mode",
  };
  return states[value] !== undefined ? states[value] : `Unknown (${value})`;
}

// STATUS_1 - Bytes 6-7: Start battery voltage (uint16 LE, Table 5.3)
// Spec defines this as Vdc using Table 5.3 — resolution not explicitly stated.
// Using 0.05 Vdc/bit consistent with other RV-C DC voltage fields and the
// CHARGER_STATUS approach, valid range tops at ~3276.75 V (0xFFFA = out of range).
function decodeStartBatteryVoltage(value) {
  if (value <= 65530) {
    return parseFloat((value * 0.05).toFixed(2));
  } else if (value === 65533) {
    return "Out of Range";
  } else if (value === 65534) {
    return "Reserved";
  } else if (value === 65535) {
    return "Not Available";
  }
  return "Invalid";
}

// STATUS_2 - Byte 1: Coolant temperature (uint8, °C, -40 offset per Table 5.3)
// Output in °F by default to match project convention (see decode_thermostat_ambient_status.js)
function decodeCoolantTemperature(value, isCelsius = false) {
  if (value <= 250) {
    const tempC = value - 40; // -40°C to +210°C range
    return isCelsius ? tempC : parseFloat(((tempC * 9) / 5 + 32).toFixed(1));
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

// STATUS_2 - Byte 2: Oil pressure (uint8, kPa, 4 kPa/bit, 0-1000 kPa)
function decodeOilPressure(value) {
  if (value <= 250) {
    return value * 4; // 4 kPa per step
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

// STATUS_2 - Bytes 3-4: Engine RPM (uint16 LE, 0.125 rpm/bit)
function decodeEngineRPM(value) {
  if (value <= 65530) {
    return parseFloat((value * 0.125).toFixed(2));
  } else if (value === 65533) {
    return "Out of Range";
  } else if (value === 65534) {
    return "Reserved";
  } else if (value === 65535) {
    return "Not Available";
  }
  return "Invalid";
}

// STATUS_2 - Bytes 5-6: Fuel rate (uint16 LE, 0.05 lph/bit)
function decodeFuelRate(value) {
  if (value <= 65530) {
    return parseFloat((value * 0.05).toFixed(2));
  } else if (value === 65533) {
    return "Out of Range";
  } else if (value === 65534) {
    return "Reserved";
  } else if (value === 65535) {
    return "Not Available";
  }
  return "Invalid";
}

// === DGN-specific Decode Functions ===

// GENERATOR_STATUS_1 (1FFDC) - §6.18.23
function decodeStatus1(data, result) {
  // Byte 0: Status
  result.status = decodeGeneratorStatus(data[0]);
  result.raw_status = data[0];

  // Bytes 1-4: Engine Run Time (uint32 LE, minutes) — converted to hours
  const runTimeRaw = decodeUint32(data, 1);
  result.engine_run_time = parseFloat((runTimeRaw / 60).toFixed(1));
  result.raw_engine_run_time = runTimeRaw;

  // Byte 5: Engine Load (uint8, %, Table 5.3)
  if (data[5] <= 250) {
    result.engine_load = data[5];
  } else if (data[5] === 251) {
    result.engine_load = "Error";
  } else if (data[5] === 252) {
    result.engine_load = "Not Supported";
  } else if (data[5] === 253) {
    result.engine_load = "Out of Range";
  } else if (data[5] === 254) {
    result.engine_load = "Reserved";
  } else {
    result.engine_load = "Not Available";
  }
  result.raw_engine_load = data[5];

  // Bytes 6-7: Start Battery Voltage (uint16 LE)
  const batteryVoltageRaw = decodeUint16(data, 6);
  result.start_battery_voltage = decodeStartBatteryVoltage(batteryVoltageRaw);
  result.raw_start_battery_voltage = batteryVoltageRaw;

  // Convenience fields
  result.generator_running = result.status === "Running";
  result.generator_fault = result.status === "Fault";
  result.generator_starting =
    result.status === "Cranking" ||
    result.status === "Preheat" ||
    result.status === "Priming";
}

// GENERATOR_STATUS_2 (1FFDB) - §6.18.24
function decodeStatus2(data, result) {
  // Byte 0: Fault/switch bits (4x uint2)
  const faultByte = data[0];
  result.temperature_shutdown = BIT2_STATES[decodeBits(faultByte, 0, 1)];
  result.oil_pressure_shutdown = BIT2_STATES[decodeBits(faultByte, 2, 3)];
  result.oil_level_switch = BIT2_STATES[decodeBits(faultByte, 4, 5)];
  result.caution_light = BIT2_STATES[decodeBits(faultByte, 6, 7)];
  result.raw_fault_byte = faultByte;

  // Byte 1: Coolant Temperature (uint8, °C, offset -40)
  result.coolant_temperature = decodeCoolantTemperature(data[1]);
  result.raw_coolant_temperature = data[1];

  // Byte 2: Oil Pressure (uint8, kPa, 4 kPa/bit)
  result.oil_pressure = decodeOilPressure(data[2]);
  result.raw_oil_pressure = data[2];

  // Bytes 3-4: Engine RPM (uint16 LE, 0.125 rpm/bit)
  const rpmRaw = decodeUint16(data, 3);
  result.engine_rpm = decodeEngineRPM(rpmRaw);
  result.raw_engine_rpm = rpmRaw;

  // Bytes 5-6: Fuel Rate (uint16 LE, 0.05 lph/bit)
  const fuelRateRaw = decodeUint16(data, 5);
  result.fuel_rate = decodeFuelRate(fuelRateRaw);
  result.raw_fuel_rate = fuelRateRaw;

  // Convenience fields
  result.temperature_shutdown_active = result.temperature_shutdown === "Active";
  result.oil_pressure_shutdown_active =
    result.oil_pressure_shutdown === "Active";
  result.low_oil_level = result.oil_level_switch === "Active";
  result.caution_light_on = result.caution_light === "Active";
  result.engine_running =
    typeof result.engine_rpm === "number" && result.engine_rpm > 0;
}

// === Main Decode Function ===

function decodeGeneratorMessage(dgn, dgn_name, data) {
  const result = {
    dgn: dgn,
    dgn_name: dgn_name,
  };

  if (data.length < 8) {
    result.error = `Expected 8 bytes, got ${data.length}`;
    return result;
  }

  if (dgn_name === "GENERATOR_STATUS_1") {
    decodeStatus1(data, result);
  } else if (dgn_name === "GENERATOR_STATUS_2") {
    decodeStatus2(data, result);
  } else {
    result.error = `Unhandled GENERATOR_STATUS DGN: ${dgn_name}`;
  }

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

// Decode the GENERATOR_STATUS message
const decodedData = decodeGeneratorMessage(dgn, dgn_name, dataBytes);

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

// Clean up the raw data field
delete msg.payload.data_payload;

return msg;
