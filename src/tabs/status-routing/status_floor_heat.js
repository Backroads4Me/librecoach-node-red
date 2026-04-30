// HA Status Updater for Floor Heat

const payload = msg.payload;
const instance = payload.instance;
const raw_setpoint = payload.raw_setpoint;

// --- Level Map ---
const levelMap = global.get("floorHeatLevelMap", "file") || {};

// Determine the preset mode early
// "store" (lowest level) maps to HA's built-in "none" preset
const rawPreset = levelMap[raw_setpoint]?.preset || "store";
const presetMode = rawPreset === "store" ? "none" : rawPreset;
const isStorePreset = rawPreset === "store";

// --- Climate Status ---
const climatePayload = {};
climatePayload.measured_temperature = payload.measured_temperature;
climatePayload.preset_mode = presetMode;

// Mode (Strictly controlled by operating status and schedule status)
let climateMode;
if (payload.operating_status === "Off") {
  climateMode = "off";
} else {
  // If the system is ON, mode is "auto" only if the schedule is enabled, otherwise "heat"
  climateMode = payload.schedule_mode === "Enabled" ? "auto" : "heat";
}
climatePayload.mode = climateMode;

// Action (idle when off, store, or heating)
let action;
if (payload.operating_status === "Off") {
  action = "off";
} else if (isStorePreset) {
  action = "idle";
} else {
  action = payload.heating_active ? "heating" : "idle";
}
climatePayload.action = action;

// --- Update Context ---

// Save schedule state
const scheduleContextKey = `floorHeat_${instance}_ScheduleOn`;
global.set(scheduleContextKey, payload.schedule_mode === "Enabled", "file");

// Save the currently active preset name for command encoder use (internal name, not HA name)
const currentPresetKey = `floorHeat_${instance}_CurrentPreset`;
global.set(currentPresetKey, rawPreset, "file");

// --- Create MQTT message ---
const climateEntityId = `floor_heat_${instance}`;
const climateStateTopic = `homeassistant/climate/${climateEntityId}/state`;

msg.topic = climateStateTopic;
msg.payload = {
  measured_temperature: payload.measured_temperature,
  preset_mode: presetMode,
  mode: climateMode,
  action: action,
};

return msg;
