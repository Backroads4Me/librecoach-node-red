// Encodes MQTT Climate commands into FURNACE_COMMAND messages (1FFE6)

// --- Configuration ---
const SOURCE_ADDRESS = global.get("rvc_source_address") || 254;
const PRIORITY = 6;
const DGN = "1FFE6"; // FURNACE_COMMAND

// --- Input Validation ---
const topic = msg.topic;
if (!topic) return null;

const payload = msg.payload;

const parts = topic.split("/");
// Expected: homeassistant/climate/furnace_{instance}/{cmd}/set
const entityPart = parts[2];
if (!entityPart || !entityPart.startsWith("furnace_")) return null;

const instanceMatch = entityPart.match(/furnace_(\d+)/);
if (!instanceMatch) return null;

const instance = parseInt(instanceMatch[1], 10);
if (isNaN(instance)) return null;

// Read cached furnace state to preserve current settings while changing others
const cached = global.get(`furnace_${instance}_status`, "file") || {};
const cachedHeatSource =
  cached.raw_heat_source !== undefined ? cached.raw_heat_source : 0x00;

// --- Determine Changes ---
let newModeRaw =
  cached.operating_mode !== undefined ? cached.operating_mode : 0;
let fanSpeed = 0xff; // Not Available (let furnace decide)
let heatOutput = 0xff; // Not Available (let furnace decide)

if (topic.endsWith("/mode/set")) {
  const val = payload.toString().toLowerCase();

  if (val === "heat") {
    // HA "heat" -> RV-C Automatic (0x00): furnace runs its own thermostat
    newModeRaw = 0x00;
    fanSpeed = 200; // 100% Fan (0.5% per step)
    heatOutput = 100; // 100% Heat (1% per step)
  } else if (val === "off") {
    // No explicit "off" mode in RV-C; turn off by setting output levels to 0%
    fanSpeed = 0;
    heatOutput = 0;
  } else {
    return null;
  }
} else if (topic.endsWith("/temp/set")) {
  // FURNACE_COMMAND (1FFE6) does not contain temperature setpoint bytes.
  // Temperature is controlled via THERMOSTAT_COMMAND (1FFE1) or internal config.
  node.warn(
    `[encode_furnace_command] Temperature setpoint not supported by FURNACE_COMMAND. Dropping.`,
  );
  return null;
} else {
  return null;
}

// --- Build Payload (1FFE6) ---
const dataBytes = new Array(8).fill(0xff);
dataBytes[0] = instance; // Byte 0: Instance
dataBytes[1] = (newModeRaw & 0x03) | ((cachedHeatSource & 0x3f) << 2); // Byte 1: Operating mode (bits 0-1) + Heat source (bits 2-7)
dataBytes[2] = fanSpeed; // Byte 2: Fan Speed
dataBytes[3] = heatOutput; // Byte 3: Heat Output Level

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
  fill: "green",
  shape: "dot",
  text: `Furnace ${instance} -> ${fanSpeed > 0 ? "ON" : "OFF"}`,
});

return null;
