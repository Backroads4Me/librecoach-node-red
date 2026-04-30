// Decoder for DC_LOAD_STATUS (DGN 1FFBDh, §6.23.2)
// Input: msg.payload from decode_rvc_can (dgn, dgn_name, data_payload)
// Output: decoded fields merged into payload

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

if (typeof data_payload !== "string" || data_payload.length < 16) {
  node.warn("Invalid data_payload: expected at least 8-byte hex string");
  return null;
}

// Parse hex string to byte array
const d = [];
for (let i = 0; i < data_payload.length; i += 2) {
  const b = parseInt(data_payload.substring(i, i + 2), 16);
  if (isNaN(b)) {
    node.warn(
      `Invalid hex byte in data_payload: ${data_payload.substring(i, i + 2)}`,
    );
    return null;
  }
  d.push(b);
}

// Byte 0: Instance
const instance = d[0];
if (instance < 1 || instance > 250) {
  return null;
}

// Byte 1: Group bitmap
// Byte 2: Operating Status (Table 5.3 — 0.5% per step, 0-200 = 0-100%)
const opRaw = d[2];
let operating_status;
if (opRaw <= 200) {
  operating_status = parseFloat((opRaw * 0.5).toFixed(1));
} else if (opRaw === 252) {
  operating_status = "Load Delay Active";
} else if (opRaw >= 251) {
  operating_status = "Not Available";
}

// Byte 3: Mode / Variable / Priority
const byte3 = d[3];
const operating_mode = byte3 & 0x03; // bits 0-1
const variable_level = (byte3 >> 2) & 0x03; // bits 2-3
const priority = (byte3 >> 4) & 0x0f; // bits 4-7

const result = {
  dgn: dgn,
  dgn_name: "DC_LOAD_STATUS",
  instance: instance,
  group: d[1],
  operating_status: operating_status,
  operating_mode: operating_mode === 0 ? "Automatic" : "Manual",
  variable_level_capability: variable_level === 1,
  priority: priority === 0x0f ? "No Data" : priority,
};

// Bytes 4: Delay
if (d[4] !== 0xff) {
  result.delay = d[4];
}

// Byte 5: Demanded Current (Table 5.3)
if (d[5] !== 0xff) {
  result.demanded_current = d[5];
}

// Bytes 6-7: Present Current (uint16, Table 5.3)
if (d.length >= 8) {
  const presentRaw = d[6] | (d[7] << 8);
  if (presentRaw !== 0xffff) {
    result.present_current = presentRaw;
  }
}

msg.payload = {
  ...incomingPayload,
  ...result,
};

return msg;
