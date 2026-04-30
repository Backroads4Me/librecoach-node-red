// Decodes CIRCULATION_PUMP_STATUS messages (1FE97)

// === Helper Functions ===

function decodeOutputStatus(value) {
  // Output status mapping
  const statuses = {
    0: "Off",
    1: "On",
    5: "Test (Forced On)",
  };
  return statuses[value] || `Unknown (${value})`;
}

function decode2BitStatus(value) {
  // Generic 2-bit status for warning/error fields
  const statuses = {
    0: "OK",
    1: "Warning",
    2: "Reserved",
    3: "Not Available",
  };
  return statuses[value] || `Unknown (${value})`;
}

// === Main Decode Function ===

function decodeCirculationPumpStatusMessage(dgn, data) {
  const result = {
    dgn: dgn,
    dgn_name: "CIRCULATION_PUMP_STATUS",
  };

  if (data.length < 3) {
    result.error = "Data payload too short (expected at least 3 bytes)";
    return result;
  }

  // Byte 0: Instance
  result.instance = data[0];
  if (result.instance === 0) {
    result.instance_description = "All pumps";
  } else if (result.instance >= 1 && result.instance <= 250) {
    result.instance_description = `Pump ${result.instance}`;
  } else {
    result.instance_description = "Invalid";
  }

  // Byte 1, Bits 0-3: Output Status
  const outputStatusRaw = data[1] & 0x0f;
  result.output_status = decodeOutputStatus(outputStatusRaw);
  result.pump_running = outputStatusRaw === 1 || outputStatusRaw === 5;

  // Byte 2: Status flags
  const byte2 = data[2];

  // Bits 0-1: Pump Overcurrent Status
  const overcurrentRaw = byte2 & 0x03;
  result.overcurrent_status = decode2BitStatus(overcurrentRaw);
  result.overcurrent_detected = overcurrentRaw === 1;

  // Bits 2-3: Pump Undercurrent Status
  const undercurrentRaw = (byte2 >> 2) & 0x03;
  result.undercurrent_status = decode2BitStatus(undercurrentRaw);
  result.undercurrent_detected = undercurrentRaw === 1;

  // Bits 4-5: Pump Temperature Status
  const temperatureRaw = (byte2 >> 4) & 0x03;
  result.temperature_status = decode2BitStatus(temperatureRaw);
  result.temperature_warning = temperatureRaw === 1;

  // Convenience fields
  result.status = result.pump_running ? "ON" : "OFF";
  result.has_fault =
    result.overcurrent_detected ||
    result.undercurrent_detected ||
    result.temperature_warning;

  // Raw values for debugging
  result.raw_instance = data[0];
  result.raw_output_status = outputStatusRaw;
  result.raw_byte2 = byte2;

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

// Decode the CIRCULATION_PUMP_STATUS message
const decodedData = decodeCirculationPumpStatusMessage(dgn, dataBytes);

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
