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
// Dry mode remains intentionally hidden from Home Assistant controls.
let modes;
if (zoneConfig.MAV) {
  const mav = zoneConfig.MAV;
  modes = ["off"];
  if (mav & (1 << 1)) modes.push("fan_only");
  if (mav & (1 << 2)) modes.push("cool");
  if (mav & ((1 << 3) | (1 << 4) | (1 << 5) | (1 << 7) | (1 << 12) | (1 << 13))) {
    modes.push("heat");
  }
  if (mav & ((1 << 8) | (1 << 9) | (1 << 10) | (1 << 11))) {
    modes.push("auto");
  }
} else {
  // Preserve broad compatibility until the device returns capability data.
  modes = ["off", "cool", "heat", "fan_only", "auto"];
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
  default_entity_id: `climate.${entityId}`,
  icon: "mdi:thermostat",

  // Mode
  mode_command_topic: modeCommand,
  mode_state_topic: stateTopic,
  mode_state_template: "{{ value_json.mode | default('off') }}",

  // Current measured temperature
  current_temperature_topic: stateTopic,
  current_temperature_template:
    "{{ value_json.facePlateTemperature | default(0) }}",

  // Target temperature (single setpoint for cool/heat)
  temperature_command_topic: tempCommand,
  temperature_state_topic: stateTopic,
  temperature_state_template: `{% if value_json.mode == 'heat' %}{{ value_json.heat_sp | default(0) }}{% elif value_json.mode == 'auto' %}{{ value_json.cool_sp | default(0) }}{% else %}{{ value_json.cool_sp | default(0) }}{% endif %}`,

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

const messages = [
  {
    topic: discoveryTopic,
    payload: discoveryPayload,
    entityId,
  },
];

const diagnosticDevice = {
  identifiers: [`librecoach-ble-microair-${safeMac}`],
  name: `MicroAir ${mac}`,
  manufacturer: "LibreCoach",
  via_device: "librecoach-climate",
};

const diagnostics = [
  {
    component: "binary_sensor",
    id: `microair_${safeMac}_availability`,
    payload: {
      name: "BLE Availability",
      unique_id: `microair_${safeMac}_availability`,
      default_entity_id: `binary_sensor.microair_${safeMac}_availability`,
      device_class: "connectivity",
      entity_category: "diagnostic",
      state_topic: `librecoach/ble/microair/${mac}/available`,
      payload_on: "online",
      payload_off: "offline",
      device: diagnosticDevice,
    },
  },
  {
    component: "sensor",
    id: `microair_${safeMac}_last_success`,
    payload: {
      name: "BLE Last Success",
      unique_id: `microair_${safeMac}_last_success`,
      default_entity_id: `sensor.microair_${safeMac}_last_success`,
      entity_category: "diagnostic",
      device_class: "timestamp",
      // ha-addons publishes an ISO8601 timestamp on this dedicated topic.
      state_topic: `librecoach/ble/microair/${mac}/last_success`,
      device: diagnosticDevice,
    },
  },
  {
    component: "sensor",
    id: `microair_${safeMac}_failure_count`,
    payload: {
      name: "BLE Failure Count",
      unique_id: `microair_${safeMac}_failure_count`,
      default_entity_id: `sensor.microair_${safeMac}_failure_count`,
      entity_category: "diagnostic",
      state_class: "measurement",
      // ha-addons publishes a plain integer on this dedicated topic.
      state_topic: `librecoach/ble/microair/${mac}/failure_count`,
      device: diagnosticDevice,
    },
  },
  {
    component: "sensor",
    id: `microair_${safeMac}_last_error`,
    payload: {
      name: "BLE Last Error",
      unique_id: `microair_${safeMac}_last_error`,
      default_entity_id: `sensor.microair_${safeMac}_last_error`,
      entity_category: "diagnostic",
      // ha-addons publishes none | auth_failed | connectivity on this topic,
      // distinguishing an auth failure from a connectivity/range/power failure.
      state_topic: `librecoach/ble/microair/${mac}/last_error`,
      device: diagnosticDevice,
    },
  },
  {
    component: "button",
    id: `microair_${safeMac}_reconnect`,
    payload: {
      name: "BLE Reconnect",
      unique_id: `microair_${safeMac}_reconnect`,
      default_entity_id: `button.microair_${safeMac}_reconnect`,
      icon: "mdi:bluetooth-connect",
      entity_category: "config",
      // Forces an immediate retry instead of waiting out the backoff schedule.
      command_topic: `librecoach/ble/microair/${mac}/reconnect`,
      availability_topic: "librecoach/nodered/status",
      device: diagnosticDevice,
    },
  },
  {
    component: "button",
    id: `microair_${safeMac}_clear_errors`,
    payload: {
      name: "BLE Clear Errors",
      unique_id: `microair_${safeMac}_clear_errors`,
      default_entity_id: `button.microair_${safeMac}_clear_errors`,
      icon: "mdi:alert-circle-check",
      entity_category: "config",
      // Resets failure_count / last_error and the backoff cadence.
      command_topic: `librecoach/ble/microair/${mac}/clear_errors`,
      availability_topic: "librecoach/nodered/status",
      device: diagnosticDevice,
    },
  },
];

for (const diagnostic of diagnostics) {
  messages.push({
    topic: `homeassistant/${diagnostic.component}/${diagnostic.id}/config`,
    payload: diagnostic.payload,
  });
}

// Track discovery topic for cleanup when disabled
let discoveryTopics = global.get("microairDiscoveryTopics", "file") || [];
for (const message of messages) {
  if (
    message.topic.startsWith("homeassistant/") &&
    !discoveryTopics.includes(message.topic)
  ) {
    discoveryTopics.push(message.topic);
  }
}
global.set("microairDiscoveryTopics", discoveryTopics, "file");

return [messages];
