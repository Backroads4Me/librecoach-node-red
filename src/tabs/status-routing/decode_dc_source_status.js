// Status Updater for DC Source
// Decodes DC_SOURCE_STATUS_1/2/3 messages (1FFFD/C/B)

// Decodes a bitfield from within a byte
function decodeBits(byte, startBit, endBit) {
  const mask = ((1 << (endBit - startBit + 1)) - 1) << startBit;
  return (byte & mask) >> startBit;
}

// Decodes the DC Instance (Byte 0)
function decodeDCInstance(value) {
  const dcInstances = {
    0: "Invalid",
    1: "Main House Battery Bank",
    2: "Chassis Start Battery",
    3: "Secondary House Battery Bank",
    4: "Generator Starter Battery",
  };
  // Per the spec, 5-250 are valid "Other" instances
  if (value >= 5 && value <= 250) {
    return `Other DC Instance ${value}`;
  }
  return dcInstances[value] || `Unknown DC Instance ${value}`;
}

// Decodes the Device Priority (Byte 1)
function decodeDevicePriority(value) {
  const priorities = {
    20: "Voltmeter",
    40: "Voltmeter/Ammeter",
    60: "Inverter",
    80: "Charger",
    100: "Inverter/Charger",
    120: "Battery SOC/BMS Device",
  };
  return priorities[value] || `Unknown Priority ${value}`;
}

// Decodes DC Voltage (uint16)
function decodeDCVoltage(value) {
  if (value <= 64000) return parseFloat((value * 0.05).toFixed(2));
  if (value === 65535) return "Not Available";
  return "Invalid";
}

// Decodes DC Current (32-bit signed)
function decodeDCCurrent32bit(value) {
  if (value === 4294967295) return "Not Available";

  // Convert 32-bit unsigned to signed
  if (value > 2147483647) {
    value = value - 4294967296;
  }

  // The spec does not define the range for current.
  return parseFloat((value * 0.05).toFixed(2));
}

// Decodes Temperature (uint16, 0.03125°C/bit, Kelvin base, output °F)
function decodeTemperature(value) {
  if (value <= 64000) {
    const tempC = value * 0.03125 - 273.15;
    return parseFloat(((tempC * 9) / 5 + 32).toFixed(1));
  }
  if (value === 65535) return "Not Available";
  return "Invalid";
}

// Decodes State of Charge / Health / Relative Capacity (uint8)
function decodePercentage(value) {
  // 0.5% per step.
  if (value <= 200) return parseFloat((value * 0.5).toFixed(1));
  if (value === 255) return "Not Available";
  return "Invalid";
}

// === DGN-Specific Decoders ===

function decodeDCSourceStatus1(data) {
  if (data.length < 8) return { error: "Invalid data length for STATUS_1" };

  const result = { dgn_name: "DC_SOURCE_STATUS_1" };

  result.instance = data[0];
  result.instance_name = decodeDCInstance(data[0]);

  // Validate instance - DC Source valid instances are 1-250
  if (result.instance < 1 || result.instance > 250) {
    node.warn(
      `Invalid DC source instance (STATUS_1): ${result.instance} (${result.instance_name}) - message ignored`,
    );
    return null;
  }

  result.device_priority = decodeDevicePriority(data[1]);

  const voltage = (data[3] << 8) | data[2];
  result.dc_voltage_V = decodeDCVoltage(voltage);

  const current = (data[7] << 24) | (data[6] << 16) | (data[5] << 8) | data[4];
  result.dc_current_A = decodeDCCurrent32bit(current);

  return result;
}

function decodeDCSourceStatus2(data) {
  if (data.length < 8) return { error: "Invalid data length for STATUS_2" };

  const result = { dgn_name: "DC_SOURCE_STATUS_2" };

  result.instance = data[0];
  result.instance_name = decodeDCInstance(data[0]);

  // Validate instance - DC Source valid instances are 1-250
  if (result.instance < 1 || result.instance > 250) {
    node.warn(
      `Invalid DC source instance (STATUS_2): ${result.instance} (${result.instance_name}) - message ignored`,
    );
    return null;
  }

  result.device_priority = decodeDevicePriority(data[1]);

  const temp = (data[3] << 8) | data[2];
  result.source_temperature = decodeTemperature(temp);

  result.state_of_charge_percent = decodePercentage(data[4]);

  const time = (data[6] << 8) | data[5];
  result.time_remaining_min = time <= 64000 ? time : "Not Available";

  const interp = decodeBits(data[7], 0, 1);
  const interpMap = {
    0: "Time to Empty",
    1: "Time to Full",
    3: "Not Available",
  };
  result.time_remaining_interpretation = interpMap[interp] || "Reserved";

  return result;
}

function decodeDCSourceStatus3(data) {
  if (data.length < 8) return { error: "Invalid data length for STATUS_3" };

  const result = { dgn_name: "DC_SOURCE_STATUS_3" };

  result.instance = data[0];
  result.instance_name = decodeDCInstance(data[0]);

  // Validate instance - DC Source valid instances are 1-250
  if (result.instance < 1 || result.instance > 250) {
    node.warn(
      `Invalid DC source instance (STATUS_3): ${result.instance} (${result.instance_name}) - message ignored`,
    );
    return null;
  }

  result.device_priority = decodeDevicePriority(data[1]);
  result.state_of_health_percent = decodePercentage(data[2]);

  const cap = (data[4] << 8) | data[3];
  result.capacity_remaining_Ah = cap <= 64000 ? cap : "Not Available";

  result.relative_capacity_percent = decodePercentage(data[5]);

  const ripple = (data[7] << 8) | data[6];
  result.ac_rms_ripple_mV = ripple <= 65530 ? ripple : "Not Available";

  return result;
}

// === Main Router Function ===

function decodeDCSourceMessage(dgn, data) {
  switch (dgn) {
    case "1FFFD":
      return decodeDCSourceStatus1(data);
    case "1FFFC":
      return decodeDCSourceStatus2(data);
    case "1FFFB":
      return decodeDCSourceStatus3(data);
    default:
      return {
        dgn: dgn,
        error: `Unsupported DGN for DC_SOURCE_STATUS decoding.`,
      };
  }
}

// === Main Node-RED Logic ===

const incomingPayload = msg.payload;
if (!incomingPayload || !incomingPayload.dgn || !incomingPayload.data_payload) {
  node.warn("Missing required fields: dgn and/or data_payload");
  return null;
}

// Convert hex payload to byte array
const dataBytes = [];
for (let i = 0; i < incomingPayload.data_payload.length; i += 2) {
  dataBytes.push(
    parseInt(incomingPayload.data_payload.substring(i, i + 2), 16),
  );
}

// Decode the message by routing to the correct function based on DGN
const decodedData = decodeDCSourceMessage(incomingPayload.dgn, dataBytes);

// Handle null return (invalid instance filtered out)
if (!decodedData) {
  return null;
}

// Merge the original payload and the newly decoded data
msg.payload = {
  ...incomingPayload,
  ...decodedData,
};

// Clean up by removing the raw hex payload
delete msg.payload.data_payload;

return msg;
