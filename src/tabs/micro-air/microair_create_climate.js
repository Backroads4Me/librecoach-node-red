// Create MicroAir Climate Entity for Home Assistant
// Uses cached zone config (MAV, SPL) and observed max fan speed
// for dynamic modes, fan modes, and temperature limits

const microairEnabled = global.get("microairEnabled");
if (!microairEnabled) return null;

const payload = msg.payload;
if (!payload || !payload.mac) return null;

const mac = payload.mac;
const safeMac = mac.replace(/:/g, "_");
const zone = payload.zone;
if (zone === undefined) return null;

const uniqueId = `microair_${safeMac}_zone_${zone}`;
const entityId = uniqueId;

// --- Per-zone state and config topics ---
const stateTopic = `librecoach/ble/microair/${mac}/zone/${zone}/state`;
const discoveryTopic = `homeassistant/climate/${entityId}/config`;

// Command topics
const baseCommand = `homeassistant/climate/${entityId}`;
const modeCommand = `${baseCommand}/mode/set`;
const tempCommand = `${baseCommand}/temp/set`;
const tempHighCommand = `${baseCommand}/temp_high/set`;
const tempLowCommand = `${baseCommand}/temp_low/set`;
const fanCommand = `${baseCommand}/fan/set`;
const presetCommand = `${baseCommand}/preset/set`;

// --- Read cached config and observed capabilities ---
const zoneConfig =
  global.get(`microair_${safeMac}_zone_${zone}_config`, "file") || {};
const maxFanSpeed =
  global.get(`microair_${safeMac}_zone_${zone}_maxfan`, "file") || 2;

// --- Determine available modes ---
// Always include these base modes; MAV only removes modes we're sure aren't supported
let modes = ["off", "cool", "heat", "fan_only"];

// Add auto if supported (MAV bits 8-11)
// Add dry if supported (MAV bit 6)
// Default: include both unless MAV explicitly excludes them
if (zoneConfig.MAV) {
  const mav = zoneConfig.MAV;
  // Auto modes: bits 8, 9, 10, 11
  if (mav & (0x100 | 0x200 | 0x400 | 0x800)) {
    modes.push("auto");
  }
  // Dry mode: bit 6
  if (mav & 0x40) {
    modes.push("dry");
  }
} else {
  // No config yet — include everything as default
  modes.push("auto", "dry");
}

// --- Determine fan modes from observed max speed ---
let fanModes;
if (maxFanSpeed >= 3) {
  // 3-speed system
  fanModes = ["low", "medium", "high", "auto"];
} else {
  // 2-speed system (default)
  fanModes = ["low", "high", "auto"];
}

// --- Determine heat type presets from MAV ---
const HEAT_TYPE_PRESETS = {
  "Heat Pump": 5,
  Furnace: 4,
  "Gas Furnace": 3,
  "Heat Strip": 7,
  "Electric Heat": 12,
};
let presetModes = [];
if (zoneConfig.MAV) {
  const mav = zoneConfig.MAV;
  for (const [name, bit] of Object.entries(HEAT_TYPE_PRESETS)) {
    if (mav & (1 << bit)) {
      presetModes.push(name);
    }
  }
}

// --- Determine temp limits from SPL ---
let minTemp = 50;
let maxTemp = 90;
if (zoneConfig.SPL && zoneConfig.SPL.length >= 4) {
  minTemp = Math.min(zoneConfig.SPL[0], zoneConfig.SPL[2]);
  maxTemp = Math.max(zoneConfig.SPL[1], zoneConfig.SPL[3]);
}

// --- Discovery payload ---
const discoveryPayload = {
  name: `MicroAir Zone ${zone + 1}`,
  unique_id: uniqueId,
  icon: "mdi:thermostat",

  // Mode
  mode_command_topic: modeCommand,
  mode_state_topic: stateTopic,
  mode_state_template: "{{ value_json.mode | default('off') }}",

  // Current measured temperature
  current_temperature_topic: stateTopic,
  current_temperature_template:
    "{{ value_json.facePlateTemperature | default(0) }}",

  // Target temperature (single setpoint for cool/heat/dry)
  temperature_command_topic: tempCommand,
  temperature_state_topic: stateTopic,
  temperature_state_template: `{% if value_json.mode == 'heat' %}{{ value_json.heat_sp | default(0) }}{% elif value_json.mode == 'dry' %}{{ value_json.dry_sp | default(0) }}{% elif value_json.mode == 'auto' %}{{ value_json.cool_sp | default(0) }}{% else %}{{ value_json.cool_sp | default(0) }}{% endif %}`,

  // Auto mode high/low setpoints
  temperature_high_command_topic: tempHighCommand,
  temperature_high_state_topic: stateTopic,
  temperature_high_state_template: "{{ value_json.autoCool_sp | default(0) }}",

  temperature_low_command_topic: tempLowCommand,
  temperature_low_state_topic: stateTopic,
  temperature_low_state_template: "{{ value_json.autoHeat_sp | default(0) }}",

  // Fan Mode
  fan_mode_command_topic: fanCommand,
  fan_mode_state_topic: stateTopic,
  fan_mode_state_template: "{{ value_json.fan_mode | default('auto') }}",

  // Available modes and fan modes
  modes: modes,
  fan_modes: fanModes,

  // Heat type presets (only included when multiple heat sources available)
  ...(presetModes.length > 1
    ? {
        preset_mode_command_topic: presetCommand,
        preset_mode_state_topic: stateTopic,
        preset_mode_value_template:
          "{{ value_json.heat_source | default('none') }}",
        preset_modes: presetModes,
      }
    : {}),

  // Temperature limits
  temperature_unit: "F",
  min_temp: minTemp,
  max_temp: maxTemp,
  temp_step: 1,

  // Device info
  device: {
    identifiers: ["librecoach-climate"],
    name: "Climate",
    manufacturer: "LibreCoach",
  },

  // Availability
  availability_topic: `librecoach/ble/microair/${mac}/available`,
};

msg.topic = discoveryTopic;
msg.payload = discoveryPayload;
msg.entityId = entityId;

// Track discovery topic for cleanup when disabled
let discoveryTopics = global.get("microairDiscoveryTopics", "file") || [];
if (!discoveryTopics.includes(discoveryTopic)) {
  discoveryTopics.push(discoveryTopic);
  global.set("microairDiscoveryTopics", discoveryTopics, "file");
}

return msg;
