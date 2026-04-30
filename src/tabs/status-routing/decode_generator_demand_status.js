// Decodes GENERATOR_DEMAND_STATUS messages (1FF80)
// RV-C §6.35.2

// === Helper Functions ===

function decodeBits(value, startBit, endBit) {
  const mask = ((1 << (endBit - startBit + 1)) - 1) << startBit;
  return (value & mask) >> startBit;
}

// === GENERATOR_DEMAND_STATUS Specific Decoders ===

function decodeDemandStatus(value) {
  // Decode demand status bits (2-bit fields)
  const states = {
    0: "No Demand",
    1: "Demand Active",
    2: "Reserved",
    3: "Not Supported",
  };
  return states[value] || "Unknown";
}

function decodeOverrideStatus(value) {
  // Decode override/activity status bits (2-bit fields)
  const states = {
    0: "Normal Operation",
    1: "Override/Activity Active",
    2: "Reserved",
    3: "Not Supported",
  };
  return states[value] || "Unknown";
}

function decodeTime(hour, minute) {
  // Convert hour and minute to readable time format
  if (hour === 255 || minute === 255) {
    return "Not Available";
  }
  if (hour > 23 || minute > 59) {
    return "Invalid Time";
  }

  // Format as 24-hour time
  const hourStr = hour.toString().padStart(2, "0");
  const minStr = minute.toString().padStart(2, "0");
  return `${hourStr}:${minStr}`;
}

function decodeMinimumCycleTime(value) {
  // Minimum cycle time in minutes
  if (value === 0) {
    return "No Minimum";
  } else if (value <= 250) {
    return `${value} minutes`;
  } else if (value === 255) {
    return "Not Available";
  }
  return "Invalid";
}

// === Main Decode Function ===

function decodeGeneratorDemandMessage(dgn, data) {
  const result = {
    dgn: dgn,
    dgn_name: "GENERATOR_DEMAND_STATUS",
  };

  if (data.length >= 7) {
    // Byte 0: Demand status bits
    const byte0 = data[0];
    result.generator_demand = decodeDemandStatus(decodeBits(byte0, 0, 1));
    result.internal_demand = decodeDemandStatus(decodeBits(byte0, 2, 3));
    result.network_demand = decodeDemandStatus(decodeBits(byte0, 4, 5));
    result.external_activity_detected = decodeOverrideStatus(
      decodeBits(byte0, 6, 7),
    );

    // Byte 1: Override and control status bits
    const byte1 = data[1];
    result.manual_override_detected = decodeOverrideStatus(
      decodeBits(byte1, 0, 1),
    );
    result.quiet_time = decodeOverrideStatus(decodeBits(byte1, 2, 3));
    result.quiet_time_override = decodeOverrideStatus(decodeBits(byte1, 4, 5));
    result.generator_lock = decodeOverrideStatus(decodeBits(byte1, 6, 7));

    // Bytes 2-3: Quiet time begin hour/minute (deprecated per §6.35.2)
    result.quiet_time_begin = decodeTime(data[2], data[3]);

    // Bytes 4-5: Quiet time end hour/minute (deprecated per §6.35.2)
    result.quiet_time_end = decodeTime(data[4], data[5]);

    // Byte 6: Minimum cycle time
    result.minimum_cycle_time = decodeMinimumCycleTime(data[6]);

    // Raw values for debugging
    result.raw_demand_byte = byte0;
    result.raw_control_byte = byte1;
  }

  // Add convenience fields for easier automation logic
  result.generator_should_run =
    result.generator_demand === "Demand Active" ||
    result.internal_demand === "Demand Active" ||
    result.network_demand === "Demand Active";

  result.automatic_start_allowed =
    result.external_activity_detected !== "Override/Activity Active" &&
    result.generator_lock !== "Override/Activity Active";

  result.quiet_time_active =
    result.quiet_time === "Override/Activity Active" &&
    result.quiet_time_override !== "Override/Activity Active";

  result.manual_control_active =
    result.manual_override_detected === "Override/Activity Active";

  // Overall status assessment
  result.demand_summary = result.generator_should_run
    ? "Generator Requested"
    : "No Generator Demand";

  if (result.generator_lock === "Override/Activity Active") {
    result.demand_summary = "Generator Locked";
  } else if (result.external_activity_detected === "Override/Activity Active") {
    result.demand_summary = "External Activity Blocking";
  } else if (result.quiet_time_active) {
    result.demand_summary = "Quiet Time Active";
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

// Decode the GENERATOR_DEMAND_STATUS message
const decodedData = decodeGeneratorDemandMessage(dgn, dataBytes);

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
