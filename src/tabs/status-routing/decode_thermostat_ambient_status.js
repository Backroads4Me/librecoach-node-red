// Decodes THERMOSTAT_AMBIENT_STATUS messages (1FF9C)
// RV-C §6.16.11 — THERMOSTAT_AMBIENT_STATUS
// Message format: 3 bytes only (B0=instance, B1-2=ambient temp uint16)

// === Helper Functions ===

function decodeUint16LE(data, offset) {
  return data[offset] | (data[offset + 1] << 8);
}

// Table 5.3 uint16 temperature: raw * 0.03125 - 273 = °C
function decodeTemp16(raw, isCelsius) {
  if (raw === 65535) return null; // Not Available
  if (raw === 65534) return "Out of Range";
  const c = raw * 0.03125 - 273;
  if (isCelsius) return parseFloat(c.toFixed(1));
  return parseFloat(((c * 9) / 5 + 32).toFixed(1));
}

// === Main Decode Function ===

function decodeThermostatAmbientStatus(dgn, data) {
  const result = {
    dgn: dgn,
    dgn_name: "THERMOSTAT_AMBIENT_STATUS",
  };

  // Byte 0: Instance
  result.instance = data[0] === 255 ? null : data[0];
  result.raw_instance = data[0];

  // Bytes 1-2: Ambient temperature (uint16 LE, Table 5.3)
  if (data.length >= 3) {
    const rawTemp = decodeUint16LE(data, 1);
    result.ambient_temperature = decodeTemp16(rawTemp, false);
    result.raw_ambient_temperature = rawTemp;
  }

  return result;
}

// === Main Logic ===

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

if (typeof data_payload !== "string" || data_payload.length % 2 !== 0) {
  node.warn("Invalid data_payload: must be even-length hex string");
  return null;
}

const dataBytes = data_payload.match(/.{1,2}/g).map((b) => parseInt(b, 16));

if (dataBytes.length < 3) {
  node.warn(
    `THERMOSTAT_AMBIENT_STATUS requires 3 bytes, got ${dataBytes.length}`,
  );
  return null;
}

const decoded = decodeThermostatAmbientStatus(dgn, dataBytes);

msg.payload = { ...incomingPayload, ...decoded };
delete msg.payload.data_payload;

return msg;
