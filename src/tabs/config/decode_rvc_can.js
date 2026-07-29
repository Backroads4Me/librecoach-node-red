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
const sourceAddress = (canIdNum & 0xff)
  .toString(16)
  .padStart(2, "0")
  .toUpperCase();
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

// For PDU1 messages (PF < 0xF0), PS is the destination address (DSA). That
// includes PROPRIETARY_A (0xEF): its PS byte is a destination like any other
// PDU1 message, and is kept in the lookup key only because the proprietary
// space has no other structure to key on.
let destination_address = null;
if (pf < 0xf0 && pf !== 0xec && pf !== 0xeb) {
  destination_address = ps;
}

// Fallback: some PDU2 devices transmit with DP=0 instead of DP=1 (non-conformant).
// If DP=0 lookup failed for a PDU2 message, try the DP=1 variant from the table.
if (!dgn_name && dp === 0 && pf >= 0xf0 && lookupPgn !== "FECA") {
  const altDgn = "1" + lookupPgn;
  const altName = dgnMap.get(altDgn);
  if (altName) {
    dgn = altDgn;
    dgn_name = altName;
  }
}

// SAE J1939 DM1 is PGN 0FECA. RV-C DM_RV uses data page 1 (1FECA) and a
// different lamp/DTC layout, so the data-page fallback must never merge them.
if (dp === 0 && lookupPgn === "FECA") {
  dgn = "0FECA";
  dgn_name = "J1939_DM1";
}

// Proprietary heat control, via a SilverLeaf TM-2xx module.
//
// Attributed by endpoint address and operation code, never by the PS byte
// alone. PS is the destination for PDU1, and the SilverLeaf TM-220, TM-225,
// TM-229 Application Document documents PROP_REPORT_AQUAHOT_STATUS as EF##
// precisely because the module addresses its reply to whichever node asked --
// its own revision history records correcting that PGN from EF64 to EF##.
// Keying on the destination therefore claims every message sent to whatever
// node happens to have polled the module.
//
// The module's own address is stable: the document specifies a static source
// address of 100 (0x64) for the TM-220, TM-225 and TM-226, and 97 (0x61) for
// the TM-229. A frame is heat-control traffic when one of its endpoints is that
// module, and the operation code in the first payload byte says which message
// it is.
const TM2XX_ADDRESSES = [0x64, 0x61];
const HEAT_OPERATIONS = {
  0xa9: "AQUAHOT_STATUS_SILVERLEAF", // PROP_REPORT_AQUAHOT_STATUS
  0xaa: "AQUAHOT_REQUEST_STATUS_SILVERLEAF", // PROP_REQUEST_AQUAHOT_STATUS
  0xab: "AQUAHOT_COMMAND_SILVERLEAF", // PROP_AQUAHOT_COMMAND
};

const source_address_num = canIdNum & 0xff;

function proprietaryHeatName() {
  const involvesModule =
    TM2XX_ADDRESSES.includes(ps) ||
    TM2XX_ADDRESSES.includes(source_address_num);
  if (!involvesModule) return null;
  if (data_payload.length < 2) return "AQUAHOT_UNUSED";

  const operation = parseInt(data_payload.substring(0, 2), 16);
  return HEAT_OPERATIONS[operation] || "AQUAHOT_UNUSED";
}

// Fallback logic for proprietary PGNs not in lookup table.
//
// LibreCoach names Aqua-Hot traffic for the interface that places it on the
// bus:
//
//   SILVERLEAF  the boiler is fronted by a SilverLeaf TM-2xx module, which
//               speaks PROPRIETARY_A on its behalf from static address 0x64
//               (TM-220/225/226) or 0x61 (TM-229)
//   NATIVE      the boiler presents itself, using the PDU2 DGNs FF01, FF2E,
//               FF2F and 6C00
//
// A coach has one or the other, never both. Which one is decided by whether a
// TM-2xx is installed, not by the boiler's series -- with a module in the way
// the series is not visible on the bus at all, so it cannot be what selects the
// protocol. Ask the node at 0x64 for its PRODUCT_ID to tell them apart.
//
// The series does not decide it, and cannot: a 600-Series boiler behind a
// TM-225 produces AQUAHOT_*_SILVERLEAF traffic, while a recent 600-Series with
// RV-C built in would produce AQUAHOT_*_NATIVE traffic. Age correlates --
// boilers without an RV-C interface are the ones that need a module -- but the
// module is the fact to test.
if (!dgn_name) {
  if (lookupPgn === "6F00") {
    dgn_name = "AQUAHOT_UNUSED";
  } else if (lookupPgn === "6C00") {
    dgn_name = "AQUAHOT_STATUS_NATIVE";
  } else if (lookupPgn === "FF01") {
    dgn_name = "AQUAHOT_THERMOSTAT_STATUS_NATIVE";
  } else if (lookupPgn === "FF2E") {
    dgn_name = "AQUAHOT_SYSTEM_STATUS_NATIVE";
  } else if (lookupPgn === "FF2F") {
    dgn_name = "AQUAHOT_COMMAND_NATIVE";
  } else if (lookupPgn === "BF00") {
    dgn_name = "WIRELESS_PANEL_SIGNAL_STATUS";
  } else if (dgn === "1AA00") {
    dgn_name = "WIRELESS_PANEL_QUALITY_STATUS";
  } else if (pf === 0xef) {
    // PROPRIETARY_A is vendor-agnostic address space. Any manufacturer may use
    // it, and on a coach with SilverLeaf gauges most of it is theirs, so an
    // unrecognised frame here is labelled for what it is rather than assigned
    // to a vendor.
    dgn_name = proprietaryHeatName() || "PROPRIETARY";
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
  sourceAddress: sourceAddress,
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
