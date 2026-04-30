// Decodes CHARGER_STATUS messages (1FFC7)
// RV-C §6.20.8 — CHARGER_STATUS

// === Helper Functions ===

function decodeUint16LE(data, offset) {
  return data[offset] | (data[offset + 1] << 8);
}

function decodeDCVoltage(raw) {
  // Table 5.3: 0.05 V/bit, 65535=Not Available, 65534=Out of Range
  if (raw === 65535) return null;
  if (raw === 65534) return "Out of Range";
  return parseFloat((raw * 0.05).toFixed(2));
}

function decodeDCCurrent(raw) {
  // Table 5.3: 0.05 A/bit, 65535=Not Available, 65534=Out of Range
  if (raw === 65535) return null;
  if (raw === 65534) return "Out of Range";
  return parseFloat((raw * 0.05).toFixed(2));
}

function decodePercent(raw) {
  // Table 5.3: 0.5%/bit, 200=100%, 255=Not Available
  if (raw === 255) return null;
  return parseFloat((raw * 0.5).toFixed(1));
}

function decodeOperatingState(raw) {
  // §6.20.8b byte 6
  const states = {
    0: "Disabled",
    1: "Not Charging",
    2: "Bulk",
    3: "Absorption",
    4: "Overcharge",
    5: "Equalize",
    6: "Float",
    7: "Constant Voltage/Current",
  };
  if (raw === 255) return null;
  return states[raw] || `Unknown (${raw})`;
}

// === Main Decode Function ===

function decodeChargerStatus(dgn, data) {
  const result = {
    dgn: dgn,
    dgn_name: "CHARGER_STATUS",
  };

  // Byte 0: Instance
  result.instance = data[0];
  result.raw_instance = data[0];

  // Bytes 1–2: Charge voltage (uint16 LE, Vdc)
  const rawVoltage = decodeUint16LE(data, 1);
  result.charge_voltage = decodeDCVoltage(rawVoltage);
  result.raw_charge_voltage = rawVoltage;

  // Bytes 3–4: Charge current (uint16 LE, Adc)
  const rawCurrent = decodeUint16LE(data, 3);
  result.charge_current = decodeDCCurrent(rawCurrent);
  result.raw_charge_current = rawCurrent;

  // Byte 5: Charge current percent of maximum
  result.charge_current_pct = decodePercent(data[5]);
  result.raw_charge_current_pct = data[5];

  // Byte 6: Operating state
  result.operating_state = decodeOperatingState(data[6]);
  result.raw_operating_state = data[6];

  // Byte 7: Flags
  const flags = data[7];
  result.default_state_on_powerup =
    (flags & 0x03) === 0x01 ? "Enabled" : "Disabled";
  result.auto_recharge_enabled = ((flags >> 2) & 0x03) === 0x01;
  const fc = (flags >> 4) & 0x03;
  const forceChargeStates = {
    0: "Not Forced",
    1: "Force Bulk",
    2: "Force Float",
  };
  result.force_charge = forceChargeStates[fc] ?? `Unknown (${fc})`;
  result.raw_flags = flags;

  // Convenience booleans
  const state = result.operating_state;
  result.charger_active =
    typeof state === "string" && !["Disabled", "Not Charging"].includes(state);
  result.charger_charging =
    typeof state === "string" &&
    [
      "Bulk",
      "Absorption",
      "Overcharge",
      "Equalize",
      "Float",
      "Constant Voltage/Current",
    ].includes(state);

  // Calculated power (W)
  if (
    typeof result.charge_voltage === "number" &&
    typeof result.charge_current === "number"
  ) {
    result.charge_power = parseFloat(
      (result.charge_voltage * result.charge_current).toFixed(1),
    );
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

if (dataBytes.length < 8) {
  node.warn(`CHARGER_STATUS requires 8 bytes, got ${dataBytes.length}`);
  return null;
}

const decoded = decodeChargerStatus(dgn, dataBytes);

msg.payload = { ...incomingPayload, ...decoded };
delete msg.payload.data_payload;

return msg;
