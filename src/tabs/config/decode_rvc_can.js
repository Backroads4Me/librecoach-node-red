// RV-C CAN Message Parser
// Decodes a raw CAN message to output only the fields needed for
// downstream routing (dgn_name) and decoding (data_payload).

const originalMessage = msg.payload;

// Validate input
if (!originalMessage || typeof originalMessage !== "string") {
  node.warn(
    "Invalid message payload: expected string, got " + typeof originalMessage,
  );
  return null;
}
const dgnMap = global.get("dgnMap");
if (!dgnMap) {
  node.error(
    "dgnMap not found in global context. Ensure the map is initialized.",
  );
  return null;
}

// Parse CAN message format: CANID#PAYLOAD
const parts = originalMessage.split("#");
if (parts.length !== 2) {
  node.warn("Invalid CAN message format: " + originalMessage);
  return null;
}
const canIdHex = parts[0];
const data_payload = parts[1];
const canIdNum = parseInt(canIdHex, 16);

if (isNaN(canIdNum)) {
  node.warn("Invalid CAN ID: " + canIdHex);
  return null;
}

// Extract PGN (4-digit) and DGN (5-digit) keys

// Get the 4-digit J1939 PGN (PF + PS). This value is consistent.
const pf = (canIdNum >> 16) & 0xff; // PDU Format (Bits 16-23)
const ps = (canIdNum >> 8) & 0xff; // PDU Specific (Bits 8-15)
let pgn = ((pf << 8) | ps).toString(16).toUpperCase();

// Ensure 4 characters for known PGNs (e.g., EF4D)
while (pgn.length < 4) {
  pgn = "0" + pgn;
}

// PDU1 handling: For PF < 240, PS is destination address, not part of DGN
// Replace PS with 00 for lookup (with exceptions)
let lookupPgn = pgn;
if (pf < 0xf0) {
  // PDU1 format
  if (pf === 0xef) {
    // Exception: Proprietary messages keep PS (EF4D, EF64, EF9F)
    lookupPgn = pgn;
  } else if (pf === 0xec || pf === 0xeb) {
    // Exception: Multi-packet transport uses FF
    lookupPgn = pf.toString(16).toUpperCase() + "FF";
  } else {
    // Standard PDU1: Replace PS with 00
    lookupPgn = pf.toString(16).toUpperCase() + "00";
  }
  // Ensure 4 characters
  while (lookupPgn.length < 4) {
    lookupPgn = "0" + lookupPgn;
  }
}

// The lookup DGN starts as the lookup PGN
let dgn = lookupPgn;
let dgn_name;

// --- DGN Conversion and Primary Lookup ---
// Extract Data Page (DP) bit from CAN ID (bit 24)
const dp = (canIdNum >> 24) & 1;
if (dp) {
  dgn = "1" + lookupPgn;
}
dgn_name = dgnMap.get(dgn);

// For PDU1 messages (PF < 0xF0), PS is the destination address (DSA)
let destination_address = null;
if (pf < 0xf0 && pf !== 0xef && pf !== 0xec && pf !== 0xeb) {
  destination_address = ps;
}

// Fallback: some PDU2 devices transmit with DP=0 instead of DP=1 (non-conformant).
// If DP=0 lookup failed for a PDU2 message, try the DP=1 variant from the table.
if (!dgn_name && dp === 0 && pf >= 0xf0) {
  const altDgn = "1" + lookupPgn;
  const altName = dgnMap.get(altDgn);
  if (altName) {
    dgn = altDgn;
    dgn_name = altName;
  }
}

// Fallback logic for proprietary PGNs not in lookup table
if (!dgn_name) {
  if (pgn === "EF64") {
    dgn_name = "AQUAHOT_COMMAND_1";
  } else if (pgn === "EF9F") {
    dgn_name = "AQUAHOT_STATUS_1";
  } else if (pgn === "EF4D") {
    dgn_name = "AQUAHOT_THERMOSTAT_STATUS_1";
  } else if (lookupPgn === "6F00") {
    dgn_name = "AQUAHOT_UNUSED";
  } else if (lookupPgn === "6C00") {
    dgn_name = "AQUAHOT_STATUS_2";
  } else if (lookupPgn === "FF01") {
    dgn_name = "AQUAHOT_THERMOSTAT_STATUS_2";
  } else if (lookupPgn === "FF2E") {
    dgn_name = "AQUAHOT_SYSTEM_STATUS_2";
  } else if (lookupPgn === "FF2F") {
    dgn_name = "AQUAHOT_COMMAND_2";
  } else if (lookupPgn === "BF00") {
    dgn_name = "WIRELESS_PANEL_SIGNAL_STATUS";
  } else if (dgn === "1AA00") {
    dgn_name = "WIRELESS_PANEL_QUALITY_STATUS";
  } else if (pgn.startsWith("EF")) {
    dgn_name = "AQUAHOT_UNUSED";
  }
}

// Final output
if (!dgn_name) {
  dgn_name = "UNKNOWN";
}

const singleInstanceDgns = {
  WATER_PUMP_STATUS: "water_pump",
  AUTOFILL_STATUS: "autofill",
  GENERATOR_STATUS_1: "generator",
  GENERATOR_STATUS_2: "generator",
  GENERATOR_DEMAND_STATUS: "generator",
  LEVELING_CONTROL_STATUS: "leveling_control",
  WASTEDUMP_STATUS: "wastedump",
};

// These DGNs are defined by RV-C as single-instance devices; byte 0 is a
// status/command bit field, not a device instance.
const instance =
  singleInstanceDgns[dgn_name] || parseInt(data_payload.substring(0, 2), 16);

msg.payload = {
  originalMessage: originalMessage,
  dgn: dgn,
  dgn_name: dgn_name,
  instance: instance,
  destination_address: destination_address,
  data_payload: data_payload,
};

msg.filter_key = `${dgn_name}_${instance}`;

// Bypass RBE/deduplication exclusively for DC_DIMMER_COMMAND_2 "Toggle" buttons.
// Byte 3 equals: 0x05 (Toggle). Other commands will naturally change byte values.
if (dgn_name === "DC_DIMMER_COMMAND_2" && data_payload.length >= 8) {
  const cmdByte = parseInt(data_payload.substring(6, 8), 16);
  if (cmdByte === 0x05) {
    msg.payload._ts = Date.now();
  }
}

return msg;
