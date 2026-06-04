// Encodes MQTT Climate commands into proprietary AquaHot zone CAN messages.
// Uses FF2F (AQUAHOT_COMMAND_2) cmd_type 0x0a for interior heating priority.

// --- Configuration ---
const SOURCE_ADDRESS = global.get("rvc_source_address") || 254;
const PRIORITY = 6;
const DGN = "FF2F";

// --- Input Validation ---
const topic = msg.topic;
if (!topic) return null;

const payload = msg.payload;
const parts = topic.split("/");
// Expected: homeassistant/climate/aquahot_zone_{z}/{cmd}/set
const entityPart = parts[2];
if (!entityPart || !entityPart.startsWith("aquahot_zone_")) return null;

// E.g., aquahot_zone_1
const zoneMatch = entityPart.match(/aquahot_zone_(\d+)/);
if (!zoneMatch) return null;
const zone = parseInt(zoneMatch[1], 10);
if (isNaN(zone)) return null;

// From decode_aquahot_status_2.js:
// command_type 0x0a = Interior Heating Priority (on/off)

let isHeating = false;

if (topic.endsWith("/mode/set")) {
  const val = payload.toString().toLowerCase();
  if (val === "heat") {
    isHeating = true;
  } else if (val === "off") {
    isHeating = false;
  } else {
    return null;
  }
} else if (topic.endsWith("/temp/set")) {
  // Temperature setpoints are LOCAL to the wall panel (0x97). They are not
  // broadcast on the CAN bus. The panel compares room temp vs setpoint locally
  // and only sends zone demand on/off via WATERHEATER_COMMAND_2 (1FE98).
  // Confirmed by Phase 3 recordings: setpoint changes produced no new CAN traffic.
  node.warn(
    `[encode_aquahot_command_2] Temperature setpoints are local to the wall panel and cannot be set via CAN bus.`,
  );
  return null;
} else {
  return null;
}

// --- Build Payload (FF2F) ---
const dataBytes = new Array(8).fill(0xff);
dataBytes[0] = 0x01; // Byte 0: Instance
dataBytes[1] = 0x0a; // Byte 1: Command Type (Interior Heating = 0x0a)
dataBytes[2] = 0x00; // Byte 2: Reserved
dataBytes[3] = isHeating ? 0x01 : 0x00; // Byte 3: Status (0x01=ON, 0x00=OFF)
dataBytes[4] = 0x00;
dataBytes[5] = 0x00;

const dataHex = dataBytes
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("");

// --- Construct CAN ID ---
const dgnInt = parseInt(DGN, 16);
const canIdInt = (PRIORITY << 26) | (dgnInt << 8) | SOURCE_ADDRESS;
const canIdHex = canIdInt.toString(16).padStart(8, "0");

// --- Send Message ---
node.send({
  topic: "can/send",
  payload: `${canIdHex.toUpperCase()}#${dataHex.toUpperCase()}`,
});

node.status({
  fill: "blue",
  shape: "dot",
  text: `Set Interior Heating Priority -> ${isHeating ? "ON" : "OFF"}`,
});

return null;
