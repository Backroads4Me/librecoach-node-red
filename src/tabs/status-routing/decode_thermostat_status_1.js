// Decodes THERMOSTAT_STATUS_1 messages (1FFE2)
// RV-C §6.16.2 — THERMOSTAT_STATUS_1

// === Helper Functions ===

function decodeUint16LE(data, offset) {
  return data[offset] | (data[offset + 1] << 8);
}

// Table 5.3 uint16 temperature: raw * 0.03125 - 273 = °C
function decodeTemp16(raw, isCelsius) {
  // 65535 = Not Available, 65534 = Out of Range
  if (raw === 65535) return null;
  if (raw === 65534) return "Out of Range";
  const c = raw * 0.03125 - 273;
  if (isCelsius) return parseFloat(c.toFixed(1));
  return parseFloat(((c * 9) / 5 + 32).toFixed(1));
}

// §6.16.2b — Byte 1[0-3] Operating mode
function decodeOperatingMode(val) {
  const modes = {
    0: "Off",
    1: "Cool",
    2: "Heat",
    3: "Auto",
    4: "Fan Only",
    5: "Aux Heat",
    6: "Window Defrost",
  };
  return modes[val] !== undefined ? modes[val] : `Unknown (${val})`;
}

// §6.16.2b — Byte 1[4-5] Fan mode
function decodeFanMode(val) {
  if (val === 3) return null;
  return val === 0 ? "Auto" : "On";
}

// §6.16.2b — Byte 1[6-7] Schedule mode
function decodeScheduleMode(val) {
  if (val === 3) return null;
  return val === 0 ? "Disabled" : "Enabled";
}

// Fan speed: §6.16.2b Byte 2, uint8, 0–100%
function decodeFanSpeed(raw) {
  if (raw === 255) return null;
  return raw; // direct percentage
}

// === Main Decode Function ===

function decodeThermostatStatus1(dgn, data) {
  const result = {
    dgn: dgn,
    dgn_name: "THERMOSTAT_STATUS_1",
  };

  // Byte 0: Instance
  result.instance = data[0] === 255 ? null : data[0];
  result.raw_instance = data[0];

  // Byte 1: Bitfield — operating mode, fan mode, schedule mode
  const b1 = data[1];
  result.operating_mode = decodeOperatingMode(b1 & 0x0f); // bits 0-3
  result.fan_mode = decodeFanMode((b1 >> 4) & 0x03); // bits 4-5
  result.schedule_mode = decodeScheduleMode((b1 >> 6) & 0x03); // bits 6-7
  result.raw_b1 = b1;

  // Byte 2: Fan speed (%)
  result.fan_speed = decodeFanSpeed(data[2]);
  result.raw_fan_speed = data[2];

  // Bytes 3-4: Setpoint heat (uint16 LE, Table 5.3 temperature)
  if (data.length >= 5) {
    const rawHeat = decodeUint16LE(data, 3);
    result.setpoint_heat = decodeTemp16(rawHeat, false);
    result.raw_setpoint_heat = rawHeat;
  }

  // Bytes 5-6: Setpoint cool (uint16 LE, Table 5.3 temperature)
  if (data.length >= 7) {
    const rawCool = decodeUint16LE(data, 5);
    result.setpoint_cool = decodeTemp16(rawCool, false);
    result.raw_setpoint_cool = rawCool;
  }

  // Convenience booleans
  result.is_off = result.operating_mode === "Off";
  result.is_heating_mode =
    result.operating_mode === "Heat" || result.operating_mode === "Aux Heat";
  result.is_cooling_mode = result.operating_mode === "Cool";
  result.is_auto_mode = result.operating_mode === "Auto";
  result.fan_on = result.fan_mode === "On";

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

if (dataBytes.length < 7) {
  node.warn(`THERMOSTAT_STATUS_1 requires 7 bytes, got ${dataBytes.length}`);
  return null;
}

const decoded = decodeThermostatStatus1(dgn, dataBytes);

msg.payload = { ...incomingPayload, ...decoded };
delete msg.payload.data_payload;

return msg;
