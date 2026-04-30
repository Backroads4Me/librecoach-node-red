// HA Status Publisher for THERMOSTAT_STATUS_1 (1FFE2)
// Self-creating: publishes MQTT discovery on first valid reading per zone instance.
// Creates a climate entity with mode, fan, and dual setpoint control.

if (!msg.payload || typeof msg.payload !== "object") {
  node.warn("Invalid payload: expected object");
  return null;
}

const p = msg.payload;
const instance = p.instance;

if (typeof instance !== "number" || instance < 1 || instance > 250) return null;
if (p.operating_mode === undefined) return null;

// === RV-C → HA mode mapping ===

const MODE_MAP = {
  Off: "off",
  Cool: "cool",
  Heat: "heat",
  Auto: "heat_cool",
  "Fan Only": "fan_only",
  "Aux Heat": "heat",
  "Window Defrost": "dry",
};

const haMode = MODE_MAP[p.operating_mode] || "off";

// === RV-C → HA fan mode mapping ===
// Fan speed is raw uint8 (0-200 at 0.5% resolution): 0=auto, 100=50%, 200=100%

let haFanMode = "auto";
if (p.fan_mode === "On" && typeof p.fan_speed === "number" && p.fan_speed > 0) {
  haFanMode = p.fan_speed > 100 ? "high" : "low";
}

// === Entity identifiers ===

const entityId = `thermostat_zone_${instance}`;
const baseTopic = `homeassistant/climate/${entityId}`;

const device = {
  identifiers: ["librecoach-climate"],
  name: "Climate",
  manufacturer: "LibreCoach",
};

// === Flow context: track entity creation ===

const CREATED_KEY = "thermostatClimateCreated";
const created = flow.get(CREATED_KEY) || {};
const messages = [];

// === Create climate entity on first valid reading ===

if (!created[instance]) {
  messages.push({
    topic: `${baseTopic}/config`,
    payload: {
      name: `Thermostat Zone ${instance}`,
      unique_id: entityId,
      default_entity_id: `climate.${entityId}`,
      modes: ["off", "cool", "heat", "heat_cool", "fan_only", "dry"],
      fan_modes: ["auto", "low", "high"],
      mode_state_topic: `${baseTopic}/mode/state`,
      mode_command_topic: `${baseTopic}/mode/set`,
      fan_mode_state_topic: `${baseTopic}/fan/state`,
      fan_mode_command_topic: `${baseTopic}/fan/set`,
      temperature_state_topic: `${baseTopic}/temp/state`,
      temperature_command_topic: `${baseTopic}/temp/set`,
      temperature_high_state_topic: `${baseTopic}/temp_high/state`,
      temperature_high_command_topic: `${baseTopic}/temp_high/set`,
      temperature_low_state_topic: `${baseTopic}/temp_low/state`,
      temperature_low_command_topic: `${baseTopic}/temp_low/set`,
      current_temperature_topic: `homeassistant/sensor/thermostat_ambient_zone${instance}/state`,
      action_topic: `${baseTopic}/action/state`,
      temperature_unit: "F",
      temp_step: 1,
      device,
    },
  });
  created[instance] = true;
  flow.set(CREATED_KEY, created);
}

// === Publish mode ===

messages.push({ topic: `${baseTopic}/mode/state`, payload: haMode });

// === Publish fan mode ===

messages.push({ topic: `${baseTopic}/fan/state`, payload: haFanMode });

// === Publish setpoints ===

// Single setpoint: depends on current mode
if (haMode === "heat" && typeof p.setpoint_heat === "number") {
  messages.push({ topic: `${baseTopic}/temp/state`, payload: p.setpoint_heat });
} else if (typeof p.setpoint_cool === "number") {
  messages.push({ topic: `${baseTopic}/temp/state`, payload: p.setpoint_cool });
}

// Dual setpoints (for heat_cool mode)
if (typeof p.setpoint_heat === "number") {
  messages.push({
    topic: `${baseTopic}/temp_low/state`,
    payload: p.setpoint_heat,
  });
}
if (typeof p.setpoint_cool === "number") {
  messages.push({
    topic: `${baseTopic}/temp_high/state`,
    payload: p.setpoint_cool,
  });
}

// === Publish action (best-effort from mode — no compressor feedback available) ===

const ACTION_MAP = {
  off: "off",
  cool: "cooling",
  heat: "heating",
  heat_cool: "idle",
  fan_only: "fan",
  dry: "drying",
};
messages.push({
  topic: `${baseTopic}/action/state`,
  payload: ACTION_MAP[haMode] || "idle",
});

// === Cache state for encoder ===

global.set(
  `thermostat_zone_${instance}_status`,
  {
    operating_mode: p.operating_mode,
    raw_b1: p.raw_b1,
    raw_fan_speed: p.raw_fan_speed,
    raw_setpoint_heat: p.raw_setpoint_heat,
    raw_setpoint_cool: p.raw_setpoint_cool,
  },
  "file",
);

return [messages];
