// Record Unknown CAN — Terminal Capture Sink
// Sits AFTER the routing switch at the end of the line.
// Only receives DGNs routed to it (UNKNOWN, PROPRIETARY, COMMAND, STATUS).
// Auto-stop: 2 minutes elapsed OR 1000 messages captured
// Output 1: MQTT state (auto-stop off message)
// Output 2: Changed messages (debug passthrough)

const MAX_MESSAGES = 1000;
const MAX_DURATION_MS = 10 * 60 * 1000;
const TIMEZONE = "America/New_York";

// STATUS DGNs allowed through — discrete state only, no analog sensors.
// COMMAND, UNKNOWN, and PROPRIETARY always pass without this check.
const STATUS_WHITELIST = [
  "AC_LOAD_STATUS",
  "AC_LOAD_STATUS_2",
  "AAS_STATUS",
  "AAS_SENSOR_STATUS",
  "AIR_CONDITIONER_STATUS",
  "HEAT_PUMP_STATUS",
  "AUTOFILL_STATUS",
  "AWNING_STATUS",
  "AWNING_STATUS_2",
  "CHASSIS_MOBILITY_STATUS",
  "CHASSIS_MOBILITY_STATUS_2",
  "CIRCULATION_PUMP_STATUS",
  "DC_DIMMER_STATUS_1",
  "DC_DIMMER_STATUS_2",
  "DC_DIMMER_STATUS_3",
  "DC_DISCONNECT_STATUS",
  "DC_LIGHTING_CONTROLLER_STATUS_1",
  "DC_LIGHTING_CONTROLLER_STATUS_2",
  "DC_LIGHTING_CONTROLLER_STATUS_3",
  "DC_LIGHTING_CONTROLLER_STATUS_4",
  "DC_LIGHTING_CONTROLLER_STATUS_5",
  "DC_LIGHTING_CONTROLLER_STATUS_6",
  "DC_LOAD_STATUS",
  "DC_LOAD_STATUS_2",
  "DC_MOTOR_CONTROL_STATUS",
  "DIGITAL_INPUT_STATUS",
  "FLOOR_HEAT_STATUS",
  "FURNACE_STATUS",
  "GAS_SENSOR_STATUS",
  "GENERATOR_STATUS_1",
  "GENERATOR_STATUS_2",
  "GENERIC_INDICATOR_STATUS",
  "HYDRAULIC_PUMP_STATUS",
  "INVERTER_STATUS",
  "LOCK_STATUS",
  "LEVELING_CONTROL_STATUS",
  "LEVELING_JACK_STATUS",
  "LEVELING_AIR_STATUS",
  "REFRIGERATOR_STATUS",
  "ROOF_FAN_STATUS_1",
  "ROOF_FAN_STATUS_2",
  "SLIDE_STATUS",
  "SLIDE_MOTOR_STATUS",
  "STEP_STATUS",
  "THERMOSTAT_STATUS_1",
  "THERMOSTAT_STATUS_2",
  "TV_LIFT_STATUS",
  "ATS_STATUS",
  "VALVE_STATUS",
  "VEHICLE_SEAT_STATUS",
  "VEHICLE_SEAT_LIGHTING_STATUS",
  "WATER_PUMP_STATUS",
  "WATERHEATER_STATUS",
  "WATERHEATER_STATUS_2",
  "WINDOW_STATUS",
  "WINDOW_SHADE_CONTROL_STATUS",
];

// --- STATUS whitelist check ---
// COMMAND, UNKNOWN, PROPRIETARY always pass. Known STATUS must be whitelisted.
const dgn_name = msg.payload.dgn_name;
if (
  dgn_name !== "UNKNOWN" &&
  dgn_name !== "PROPRIETARY" &&
  !dgn_name.includes("COMMAND") &&
  !STATUS_WHITELIST.includes(dgn_name)
) {
  return [null, null];
}

// --- Parse data bytes from hex string ---
const raw = msg.payload.originalMessage || "";
const dataHex = msg.payload.data_payload || "";
const byteHexPairs = dataHex.match(/.{1,2}/g) || [];
const instanceId =
  byteHexPairs.length > 0 ? parseInt(byteHexPairs[0], 16) : null;
const data = byteHexPairs.map((h) => h.toUpperCase()).join(" ");

const seenKey = `${msg.payload.dgn}:${instanceId}`;

// RBE node upstream handles deduplication.
// Any message reaching this node is considered a legitimate event to capture.
const changed = true;

// Pass all received messages to output 2 for debug
const debugMsg = { payload: { seenKey, data, dgn_name } };

// Gate on recording state
const recording = global.get("recordUnknown", "file");
if (!recording) {
  node.status({ fill: "grey", shape: "ring", text: "Stopped" });
  return [null, debugMsg];
}
if (!changed) {
  const curLog = global.get("recordUnknownLog", "file") || [];
  node.status({
    fill: "red",
    shape: "ring",
    text: `Watching... ${curLog.length}`,
  });
  return [null, null];
}

// --- Timing ---
const log = global.get("recordUnknownLog", "file") || [];
const startTime = global.get("recordUnknownStart", "file") || Date.now();
const elapsed = Date.now() - startTime;

// Check auto-stop before adding
if (log.length >= MAX_MESSAGES || elapsed >= MAX_DURATION_MS) {
  global.set("recordUnknown", false, "file");

  const reason =
    log.length >= MAX_MESSAGES ? `${MAX_MESSAGES} messages` : "10 min elapsed";
  node.status({
    fill: "yellow",
    shape: "ring",
    text: `Auto-stopped — ${reason}`,
  });

  const offMsg = {
    topic: "homeassistant/switch/librecoach_record_unknown/state",
    payload: "0",
    retain: true,
  };

  return [offMsg, debugMsg];
}

// --- Local timestamp ---
const localISO = new Date()
  .toLocaleString("sv-SE", { timeZone: TIMEZONE, hour12: false })
  .replace(" ", "T");

// --- Build log entry ---
log.push({
  timestamp: localISO,
  dgn: msg.payload.dgn,
  dgn_name: dgn_name,
  instance: instanceId !== null ? instanceId : null,
  data: data,
  raw_can: raw,
});
global.set("recordUnknownLog", log, "file");

node.status({
  fill: "red",
  shape: "dot",
  text: `Recording... ${log.length}`,
});

return [null, debugMsg];
