// Decodes GO Power GP-RVC-30-MPPT Solar Controller messages
// Handles DGNs: 1FE80, 1FDFF, 1FEB3, 1FE85, 1FE84, 1FE83, 1FE82, 1FE81

// === Helper Functions ===

function decodeUint16LE(data, offset) {
  if (!data || offset + 1 >= data.length) return 65535;
  return data[offset] | (data[offset + 1] << 8);
}

// DC voltage: uint16 LE, 0.05V/bit, 65535=N/A
function decodeDCVoltage(raw) {
  if (raw === 65535 || raw === 65534) return null;
  return parseFloat((raw * 0.05).toFixed(2));
}

// DC current with -1600A offset: uint16 LE, 0.05A/bit
// 32000 = 0A (special zero), values encode as (amps + 1600) / 0.05
function decodeDCCurrentOffset(raw) {
  if (raw === 65535 || raw === 65534) return null;
  return parseFloat((raw * 0.05 - 1600).toFixed(2));
}

// Charging stage byte
function decodeChargingStage(raw) {
  const stages = {
    0: "Off",
    1: "Bulk",
    2: "Absorption",
    3: "Float",
    4: "Equalize",
    5: "Fault",
  };
  return stages[raw] !== undefined ? stages[raw] : `Unknown (${raw})`;
}

// Temperature: uint8, offset -40°C, output °F
function decodeTemp8(raw) {
  if (raw === 255) return null;
  const tempC = raw - 40;
  return parseFloat(((tempC * 9) / 5 + 32).toFixed(1));
}

// === Main Decode ===

if (!msg.payload || typeof msg.payload !== "object") {
  node.warn("Invalid payload");
  return null;
}

const incomingPayload = msg.payload;
const { dgn, dgn_name, data_payload } = incomingPayload;

if (!dgn || !data_payload) {
  node.warn("Missing dgn or data_payload");
  return null;
}

if (typeof data_payload !== "string" || data_payload.length % 2 !== 0) {
  node.warn("Invalid data_payload");
  return null;
}

const d = data_payload.match(/.{1,2}/g).map((b) => parseInt(b, 16));
if (d.some(isNaN) || d.length < 8) {
  node.warn("Invalid hex bytes or insufficient length");
  return null;
}

const result = {
  dgn,
  dgn_name,
  instance: d[0],
};

const dgnUpper = dgn.toUpperCase();

if (dgnUpper === "1FE80") {
  // SOLAR_CONTROLLER_BATTERY_STATUS
  // byte[1]: charging stage
  // bytes[3:4]: battery voltage uint16 LE, 0.05V/bit
  // bytes[5:6]: battery current uint16 LE, 0.05A/bit with -1600A offset
  // byte[7]: battery temperature uint8, offset -40°C
  result.charging_stage = decodeChargingStage(d[1]);
  result.raw_charging_stage = d[1];
  const vRaw = decodeUint16LE(d, 3);
  result.battery_voltage = decodeDCVoltage(vRaw);
  result.raw_battery_voltage = vRaw;
  const iRaw = decodeUint16LE(d, 5);
  result.battery_current = decodeDCCurrentOffset(iRaw);
  result.raw_battery_current = iRaw;
  result.battery_temperature = decodeTemp8(d[7]);

  // Convenience
  result.is_charging = typeof result.battery_current === "number" && result.battery_current > 0.1;
  result.charging_active = result.charging_stage !== "Off" && result.charging_stage !== "Fault";

  // Calculated watts
  if (typeof result.battery_voltage === "number" && typeof result.battery_current === "number") {
    result.battery_watts = parseFloat((result.battery_voltage * result.battery_current).toFixed(1));
  }

} else if (dgnUpper === "1FDFF") {
  // SOLAR_CONTROLLER_SOLAR_ARRAY_STATUS
  // bytes[1:2]: panel voltage uint16 LE, 0.05V/bit
  // bytes[3:4]: panel current uint16 LE, 0.05A/bit with -1600A offset
  const pvRaw = decodeUint16LE(d, 1);
  result.panel_voltage = decodeDCVoltage(pvRaw);
  result.raw_panel_voltage = pvRaw;
  const piRaw = decodeUint16LE(d, 3);
  result.panel_current = decodeDCCurrentOffset(piRaw);
  result.raw_panel_current = piRaw;

  // Calculated panel watts
  if (typeof result.panel_voltage === "number" && typeof result.panel_current === "number") {
    result.panel_watts = parseFloat((result.panel_voltage * result.panel_current).toFixed(1));
  }

  result.panels_active = typeof result.panel_voltage === "number" && result.panel_voltage > 5;

} else if (dgnUpper === "1FE81") {
  // SOLAR_CONTROLLER_STATUS_6 — charge setpoints
  // bytes[1:2]: absorption voltage setpoint
  // bytes[3:4]: float voltage setpoint
  const absRaw = decodeUint16LE(d, 1);
  result.absorption_setpoint = decodeDCVoltage(absRaw);
  result.raw_absorption_setpoint = absRaw;
  const floatRaw = decodeUint16LE(d, 3);
  result.float_setpoint = decodeDCVoltage(floatRaw);
  result.raw_float_setpoint = floatRaw;

} else if (dgnUpper === "1FEB3") {
  // SOLAR_CONTROLLER_STATUS_1 — basic status
  result.raw_byte1 = d[1];
  result.raw_byte2 = d[2];
  result.raw_byte5 = d[5];
  result.raw_byte6 = d[6];
  result.raw_byte7 = d[7];

} else if (dgnUpper === "1FE85") {
  // SOLAR_CONTROLLER_STATUS_2
  const v2Raw = decodeUint16LE(d, 1);
  result.output_voltage = decodeDCVoltage(v2Raw);
  result.raw_output_voltage = v2Raw;
  const i2Raw = decodeUint16LE(d, 3);
  result.output_current = decodeDCCurrentOffset(i2Raw);
  result.raw_output_current = i2Raw;

} else if (dgnUpper === "1FE84") {
  // SOLAR_CONTROLLER_STATUS_3
  const v3Raw = decodeUint16LE(d, 1);
  result.voltage_3 = decodeDCVoltage(v3Raw);
  result.raw_voltage_3 = v3Raw;

} else if (dgnUpper === "1FE83") {
  // SOLAR_CONTROLLER_STATUS_4
  result.raw_byte1 = d[1];
  result.raw_byte2 = d[2];
  result.raw_byte3 = d[3];
  result.raw_byte4 = d[4];
  result.raw_byte5 = d[5];

} else if (dgnUpper === "1FE82") {
  // SOLAR_CONTROLLER_STATUS_5
  result.raw_byte1 = d[1];
  result.raw_byte2 = d[2];
  result.raw_byte3 = d[3];
  result.raw_byte4 = d[4];

} else {
  node.warn(`Unhandled solar DGN: ${dgn}`);
  return null;
}

msg.payload = { ...incomingPayload, ...result };
delete msg.payload.data_payload;

return msg;
