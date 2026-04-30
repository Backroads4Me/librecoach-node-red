// Encodes MQTT Climate commands into THERMOSTAT_COMMAND_1 messages (1FEF9)
// §6.16.4 — same byte layout as THERMOSTAT_STATUS_1 (§6.16.2b)
//
// Byte 0: Instance
// Byte 1: bits 0-3 Operating mode, bits 4-5 Fan mode, bits 6-7 Schedule mode
// Byte 2: Fan speed (0-200 at 0.5% per step, 0=auto)
// Bytes 3-4: Setpoint heat (uint16 LE, Table 5.3 temperature)
// Bytes 5-6: Setpoint cool (uint16 LE, Table 5.3 temperature)
// Byte 7: Reserved (0xFF)

// --- Configuration ---
const SOURCE_ADDRESS = global.get("rvc_source_address") || 254;
const PRIORITY = 6;
const DGN = "1FEF9"; // THERMOSTAT_COMMAND_1

// --- Input Validation ---
const topic = msg.topic;
if (!topic) return null;

const payload = msg.payload;

const parts = topic.split("/");
// Expected: homeassistant/climate/thermostat_zone_{instance}/{cmd}/set
const entityPart = parts[2];
if (!entityPart || !entityPart.startsWith("thermostat_zone_")) return null;

const instanceMatch = entityPart.match(/thermostat_zone_(\d+)/);
if (!instanceMatch) return null;

const instance = parseInt(instanceMatch[1], 10);
if (isNaN(instance)) return null;

const cmdPart = parts[3]; // "mode", "fan", "temp", "temp_high", "temp_low"

// --- Read cached state ---
const cached = global.get(`thermostat_zone_${instance}_status`, "file") || {};

// --- Temperature conversion: °F → raw uint16 (Table 5.3) ---
// raw = ((°F - 32) × 5/9 + 273) / 0.03125
function tempToRaw(fahrenheit) {
  const celsius = ((fahrenheit - 32) * 5) / 9;
  return Math.round((celsius + 273) / 0.03125);
}

// --- Build 8-byte payload, default all fields to "no change" ---
const dataBytes = new Array(8).fill(0xff);
dataBytes[0] = instance;

// Byte 1 bitfield helpers
// bits 6-7: schedule mode — always "no change" (0x3)
// bits 4-5: fan mode — 0=Auto, 1=On, 3=no change
// bits 0-3: operating mode — 0=Off..6=Defrost, 0xF=no change
const SCHED_NC = 0x03;

// --- HA → RV-C mode mapping ---
const HA_TO_RVC_MODE = {
  off: 0x00,
  cool: 0x01,
  heat: 0x02,
  heat_cool: 0x03,
  fan_only: 0x04,
  dry: 0x06,
};

// --- Process command ---

if (topic.endsWith("/mode/set")) {
  const val = payload.toString().toLowerCase();
  const modeRaw = HA_TO_RVC_MODE[val];
  if (modeRaw === undefined) return null;

  if (val === "off") {
    // Off: explicitly set fan to auto (matches observed wireless remote behavior)
    dataBytes[1] = (SCHED_NC << 6) | (0x00 << 4) | modeRaw; // 0xC0
  } else {
    // Other modes: leave fan as "no change"
    dataBytes[1] = (SCHED_NC << 6) | (0x03 << 4) | modeRaw;
  }
} else if (topic.endsWith("/fan/set")) {
  const val = payload.toString().toLowerCase();

  // Leave mode as "no change" (0xF), set fan mode + speed
  if (val === "auto") {
    dataBytes[1] = (SCHED_NC << 6) | (0x00 << 4) | 0x0f; // fan=Auto, mode=nc
    dataBytes[2] = 0x00; // auto speed
  } else if (val === "low") {
    dataBytes[1] = (SCHED_NC << 6) | (0x01 << 4) | 0x0f; // fan=On, mode=nc
    dataBytes[2] = 100; // 50% (0.5% per step)
  } else if (val === "high") {
    dataBytes[1] = (SCHED_NC << 6) | (0x01 << 4) | 0x0f; // fan=On, mode=nc
    dataBytes[2] = 200; // 100%
  } else {
    return null;
  }
} else if (topic.endsWith("/temp/set")) {
  // Single setpoint: set heat or cool depending on current mode
  const temp = parseFloat(payload);
  if (isNaN(temp)) return null;

  const raw = tempToRaw(temp);
  const rawLo = raw & 0xff;
  const rawHi = (raw >> 8) & 0xff;

  // Determine which setpoint to set based on cached operating mode
  const mode = cached.operating_mode || "Cool";
  if (mode === "Heat" || mode === "Aux Heat") {
    dataBytes[3] = rawLo;
    dataBytes[4] = rawHi;
  } else {
    dataBytes[5] = rawLo;
    dataBytes[6] = rawHi;
  }
} else if (topic.endsWith("/temp_low/set")) {
  // Heat setpoint (for heat_cool mode)
  const temp = parseFloat(payload);
  if (isNaN(temp)) return null;

  const raw = tempToRaw(temp);
  dataBytes[3] = raw & 0xff;
  dataBytes[4] = (raw >> 8) & 0xff;
} else if (topic.endsWith("/temp_high/set")) {
  // Cool setpoint (for heat_cool mode)
  const temp = parseFloat(payload);
  if (isNaN(temp)) return null;

  const raw = tempToRaw(temp);
  dataBytes[5] = raw & 0xff;
  dataBytes[6] = (raw >> 8) & 0xff;
} else {
  return null;
}

// --- Construct CAN frame ---

const dataHex = dataBytes
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("");

const dgnInt = parseInt(DGN, 16);
const canIdInt = (PRIORITY << 26) | (dgnInt << 8) | SOURCE_ADDRESS;
const canIdHex = canIdInt.toString(16).padStart(8, "0");

// --- Send Message ---

node.send({
  topic: "can/send",
  payload: `${canIdHex.toUpperCase()}#${dataHex.toUpperCase()}`,
});

const cmdLabel = cmdPart === "mode" ? payload : `${cmdPart}=${payload}`;
node.status({
  fill: "green",
  shape: "dot",
  text: `Zone ${instance} → ${cmdLabel}`,
});

return null;
