// Combined decoder for WATERHEATER_STATUS (1FFF7) and WATERHEATER_STATUS_2 (1FE99)
// RV-C spec 6.9.2 and 6.9.4

// === Helper Functions ===

function decodeBits(value, startBit, endBit) {
  const mask = ((1 << (endBit - startBit + 1)) - 1) << startBit;
  return (value & mask) >> startBit;
}

function decodeUint16(data, startByte) {
  return data[startByte] | (data[startByte + 1] << 8);
}

// Decodes a standard RV-C temperature value (uint16).
// Uses 0.03125°C resolution (per RVC spec) with -273.15°C offset (Kelvin).
function decodeTemperature(value, isCelsius = false) {
  if (value <= 65530) {
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

function decodeEnginePreheat(value) {
  // Engine preheat status mapping
  const statuses = {
    0: "Off",
    1: "On",
    5: "Test (Forced On)",
  };
  return statuses[value] || `Unknown (${value})`;
}

function decode2BitOnOff(value) {
  // Generic 2-bit on/off status
  const statuses = {
    0: "Off",
    1: "On",
    2: "Reserved",
    3: "Not Available",
  };
  return statuses[value] || `Unknown (${value})`;
}

function decode2BitWarning(value) {
  // Generic 2-bit warning status
  const statuses = {
    0: "OK",
    1: "Warning",
    2: "Reserved",
    3: "Not Available",
  };
  return statuses[value] || `Unknown (${value})`;
}

function decodeCoolantLevel(value) {
  const statuses = {
    0: "Sufficient",
    1: "Low",
    2: "Reserved",
    3: "Not Available",
  };
  return statuses[value] || `Unknown (${value})`;
}

function decodeHotWaterPriority(value) {
  const priorities = {
    0: "Domestic Water",
    1: "Heating",
    2: "Reserved",
    3: "Not Available",
  };
  return priorities[value] || `Unknown (${value})`;
}

// === WATERHEATER_STATUS (1FFF7) — §6.9.2 ===

function decodeOperatingMode(value) {
  const modes = {
    0: "Off",
    1: "Combustion",
    2: "Electric",
    3: "Gas+Electric",
    4: "Auto",
    5: "Test Combustion",
    6: "Test Electric",
  };
  return modes[value] || `Unknown (${value})`;
}

function decodeStatus(data, result) {
  // Byte 1: Operating Mode
  result.operating_mode = decodeOperatingMode(data[1]);
  result.raw_operating_mode = data[1];

  // Bytes 2-3: Setpoint Temp
  const setpointRaw = decodeUint16(data, 2);
  result.setpoint_temperature = decodeTemperature(setpointRaw);
  result.raw_setpoint_temperature = setpointRaw;

  // Bytes 4-5: Water Temp
  // AquaHot 125D uses raw LE uint16 / 128 = °C (not standard RV-C Kelvin encoding)
  const waterTempRaw = decodeUint16(data, 4);
  const waterTempC = parseFloat((waterTempRaw / 128).toFixed(1));
  result.water_temperature_c = waterTempC;
  result.water_temperature = parseFloat(((waterTempC * 9) / 5 + 32).toFixed(1));
  result.raw_water_temperature = waterTempRaw;

  // Byte 6: Thermostat, Burner, AC Element, High Temp
  const byte6 = data[6];
  const thermostatRaw = decodeBits(byte6, 0, 1);
  result.thermostat_not_met = thermostatRaw === 1;
  result.raw_thermostat_not_met = thermostatRaw;

  const burnerRaw = decodeBits(byte6, 2, 3);
  result.burner_active = burnerRaw === 1;
  result.raw_burner_active = burnerRaw;

  const acElementRaw = decodeBits(byte6, 4, 5);
  result.ac_element_active = acElementRaw === 1;
  result.raw_ac_element_active = acElementRaw;

  const highTempRaw = decodeBits(byte6, 6, 7);
  result.high_temp_tripped = highTempRaw === 1;
  result.raw_high_temp_tripped = highTempRaw;

  // Byte 7: Failures and Warnings
  const byte7 = data[7];
  const igniteFailedRaw = decodeBits(byte7, 0, 1);
  result.ignite_failed = igniteFailedRaw === 1;
  result.raw_ignite_failed = igniteFailedRaw;

  const acPowerRaw = decodeBits(byte7, 2, 3);
  result.ac_power_absent = acPowerRaw === 1;
  result.raw_ac_power_absent = acPowerRaw;

  const dcPowerRaw = decodeBits(byte7, 4, 5);
  result.dc_power_absent = dcPowerRaw === 1;
  result.raw_dc_power_absent = dcPowerRaw;

  const dcPowerWarningRaw = decodeBits(byte7, 6, 7);
  result.dc_power_low = dcPowerWarningRaw === 1;
  result.raw_dc_power_low = dcPowerWarningRaw;

  // Convenience fields
  result.has_fault = result.high_temp_tripped || result.ignite_failed;
  result.any_heat_active = result.burner_active || result.ac_element_active;
}

// === WATERHEATER_STATUS_2 (1FE99) — §6.9.4 ===

function decodeStatus2(data, result) {
  // Byte 1: Electric Element Levels
  const byte1 = data[1];
  result.electric_element_level = byte1 & 0x0f; // Bits 0-3
  result.max_electric_element_level = (byte1 >> 4) & 0x0f; // Bits 4-7

  // Byte 2: Engine Preheat, Coolant Level, Hot Water Priority
  const byte2 = data[2];
  const enginePreheatRaw = byte2 & 0x0f; // Bits 0-3
  result.engine_preheat = decodeEnginePreheat(enginePreheatRaw);
  result.engine_preheat_active =
    enginePreheatRaw === 1 || enginePreheatRaw === 5;

  const coolantLevelRaw = (byte2 >> 4) & 0x03; // Bits 4-5
  result.coolant_level = decodeCoolantLevel(coolantLevelRaw);
  result.coolant_low = coolantLevelRaw === 1;

  const hotWaterPriorityRaw = (byte2 >> 6) & 0x03; // Bits 6-7
  result.hot_water_priority = decodeHotWaterPriority(hotWaterPriorityRaw);

  // Byte 3: Output Statuses
  const byte3 = data[3];
  const burnerOutputRaw = byte3 & 0x03; // Bits 0-1
  result.burner_output = decode2BitOnOff(burnerOutputRaw);
  result.burner_on = burnerOutputRaw === 1;

  const burnerIndicatorRaw = (byte3 >> 2) & 0x03; // Bits 2-3
  result.burner_indicator = decode2BitOnOff(burnerIndicatorRaw);

  const electricLowOutputRaw = (byte3 >> 4) & 0x03; // Bits 4-5
  result.electric_low_output = decode2BitOnOff(electricLowOutputRaw);
  result.electric_low_on = electricLowOutputRaw === 1;

  const electricHighOutputRaw = (byte3 >> 6) & 0x03; // Bits 6-7
  result.electric_high_output = decode2BitOnOff(electricHighOutputRaw);
  result.electric_high_on = electricHighOutputRaw === 1;

  // Byte 4: Burner Status Flags
  const byte4 = data[4];
  const burnerOvercurrentRaw = byte4 & 0x03; // Bits 0-1
  result.burner_overcurrent = decode2BitWarning(burnerOvercurrentRaw);

  const burnerUndercurrentRaw = (byte4 >> 2) & 0x03; // Bits 2-3
  result.burner_undercurrent = decode2BitWarning(burnerUndercurrentRaw);

  const burnerTempRaw = (byte4 >> 4) & 0x03; // Bits 4-5
  result.burner_temperature = decode2BitWarning(burnerTempRaw);

  const burnerInputRaw = (byte4 >> 6) & 0x03; // Bits 6-7
  result.burner_input = decode2BitOnOff(burnerInputRaw);

  // Byte 5: Burner Indicator Status Flags
  const byte5 = data[5];
  const burnerIndOvercurrentRaw = byte5 & 0x03; // Bits 0-1
  result.burner_indicator_overcurrent = decode2BitWarning(
    burnerIndOvercurrentRaw,
  );

  const burnerIndUndercurrentRaw = (byte5 >> 2) & 0x03; // Bits 2-3
  result.burner_indicator_undercurrent = decode2BitWarning(
    burnerIndUndercurrentRaw,
  );

  const burnerIndTempRaw = (byte5 >> 4) & 0x03; // Bits 4-5
  result.burner_indicator_temperature = decode2BitWarning(burnerIndTempRaw);

  const burnerIndInputRaw = (byte5 >> 6) & 0x03; // Bits 6-7
  result.burner_indicator_input = decode2BitOnOff(burnerIndInputRaw);

  // Byte 6: Electric Low Element Status Flags
  const byte6 = data[6];
  const elecLowOvercurrentRaw = byte6 & 0x03; // Bits 0-1
  result.electric_low_overcurrent = decode2BitWarning(elecLowOvercurrentRaw);

  const elecLowUndercurrentRaw = (byte6 >> 2) & 0x03; // Bits 2-3
  result.electric_low_undercurrent = decode2BitWarning(elecLowUndercurrentRaw);

  const elecLowTempRaw = (byte6 >> 4) & 0x03; // Bits 4-5
  result.electric_low_temperature = decode2BitWarning(elecLowTempRaw);

  // AquaHot 125D: bits 6-7 are independently confirmed via bus capture as
  // burner active (bit 6) and interior heating priority active (bit 7),
  // NOT the generic RV-C 2-bit "electric low input" field — so that field is
  // intentionally not decoded here. Confirmed by observing 0x83->0x43 (interior heat off,
  // burner unchanged) and 0x83->0x03 (burner off, interior heat unchanged)
  // transitions. Broadcast regardless of who issued the command, so it
  // self-heals even when LibreCoach's own outgoing commands aren't looped
  // back into decode.
  result.interior_heating_confirmed_on = (byte6 & 0x80) !== 0;
  result.burner_confirmed_on = (byte6 & 0x40) !== 0;

  // Byte 7: Electric High Element Status Flags
  const byte7 = data[7];
  const elecHighOvercurrentRaw = byte7 & 0x03; // Bits 0-1
  result.electric_high_overcurrent = decode2BitWarning(elecHighOvercurrentRaw);

  const elecHighUndercurrentRaw = (byte7 >> 2) & 0x03; // Bits 2-3
  result.electric_high_undercurrent = decode2BitWarning(
    elecHighUndercurrentRaw,
  );

  const elecHighTempRaw = (byte7 >> 4) & 0x03; // Bits 4-5
  result.electric_high_temperature = decode2BitWarning(elecHighTempRaw);

  const elecHighInputRaw = (byte7 >> 6) & 0x03; // Bits 6-7
  result.electric_high_input = decode2BitOnOff(elecHighInputRaw);

  // === Convenience Fields ===

  // AquaHot-specific: byte 2 bits 0 and 2 encode per-zone active flags
  // On standard RV-C water heaters these bits are engine preheat/coolant/priority
  // VALIDATED: Recordings confirm C0=none, C1=zone_0, C4=zone_1, C5=both
  // Zone numbering is bit-positional (bit 0 → zone 0, bit 2 → zone 1)
  result.zone_active = [
    (byte2 & 0x01) === 1, // zone 0: bit 0
    ((byte2 >> 2) & 0x01) === 1, // zone 1: bit 2
  ];
  result.any_zone_active = result.zone_active[0] || result.zone_active[1];

  // Overall heating status
  result.any_heat_source_on =
    result.burner_on ||
    result.electric_low_on ||
    result.electric_high_on ||
    result.engine_preheat_active;

  // Determine primary status for simple display
  if (result.burner_on && (result.electric_low_on || result.electric_high_on)) {
    result.status = "GAS+ELECTRIC";
  } else if (result.burner_on) {
    result.status = "GAS";
  } else if (result.electric_high_on) {
    result.status = "ELECTRIC HIGH";
  } else if (result.electric_low_on) {
    result.status = "ELECTRIC LOW";
  } else if (result.engine_preheat_active) {
    result.status = "ENGINE PREHEAT";
  } else {
    result.status = "OFF";
  }

  // Fault detection
  result.burner_fault =
    burnerOvercurrentRaw === 1 ||
    burnerUndercurrentRaw === 1 ||
    burnerTempRaw === 1;
  result.electric_low_fault =
    elecLowOvercurrentRaw === 1 ||
    elecLowUndercurrentRaw === 1 ||
    elecLowTempRaw === 1;
  result.electric_high_fault =
    elecHighOvercurrentRaw === 1 ||
    elecHighUndercurrentRaw === 1 ||
    elecHighTempRaw === 1;
  result.has_fault =
    result.burner_fault ||
    result.electric_low_fault ||
    result.electric_high_fault ||
    result.coolant_low;

  // Raw values for debugging
  result.raw_byte1 = data[1];
  result.raw_byte2 = data[2];
  result.raw_byte3 = data[3];
  result.raw_byte4 = data[4];
  result.raw_byte5 = data[5];
  result.raw_byte6 = data[6];
  result.raw_byte7 = data[7];
}

// === Main Decode Function ===

function decodeWaterheaterMessage(dgn, dgn_name, data) {
  const result = {
    dgn: dgn,
    dgn_name: dgn_name,
  };

  if (data.length < 8) {
    result.error = "Data payload too short (expected 8 bytes)";
    return result;
  }

  // Byte 0: Instance
  result.instance = data[0];
  result.raw_instance = data[0];
  if (result.instance === 0) {
    result.instance_description = "All water heaters";
  } else if (result.instance >= 1 && result.instance <= 250) {
    result.instance_description = `Water Heater ${result.instance}`;
  } else {
    result.instance_description = "Invalid";
  }

  if (dgn_name === "WATERHEATER_STATUS") {
    decodeStatus(data, result);
  } else if (dgn_name === "WATERHEATER_STATUS_2") {
    decodeStatus2(data, result);
  } else {
    result.error = `Unhandled WATERHEATER DGN: ${dgn_name}`;
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

// Decode the message
const decodedData = decodeWaterheaterMessage(dgn, dgn_name, dataBytes);

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
