// Creates Climate entity for FLOOR HEAT

// Validate input structure
const instance = msg.payload.instance;
if (typeof instance !== "number") {
  node.error("Input missing 'instance' (number).", msg);
  return null;
}

// --- Get Discovered Levels ---
const levelsKey = "uniqueFloorHeatLevels";
const levels = global.get(levelsKey, "file") || [];

// --- Build Preset List and Map ---
let levelMap = {};
let presetList = [];
let levelCounter = 1;

// The 'unique' node sorts the list, so the lowest value is always first.
// The lowest level is "store" (mapped to HA "none" preset).
const lowestLevelRaw = levels.length > 0 ? levels[0] : null;

// Helper to decode RVC raw value to Fahrenheit
const decodeTempFromRaw = (rawValue) => {
  if (rawValue === 0 || rawValue > 65530) return 0;
  const tempK = rawValue * 0.03125;
  const tempC = tempK - 273.15;
  return parseFloat(((tempC * 9) / 5 + 32).toFixed(1));
};

for (const rawVal of levels) {
  let name;
  let tempF = decodeTempFromRaw(rawVal);

  if (rawVal === lowestLevelRaw) {
    // Lowest level is "store" — mapped to HA's built-in "none" preset
    name = "store";
  } else {
    name = `level_${levelCounter++}`;
    presetList.push(name); // Only add non-store levels to preset list
  }

  // Store both directions of the map for easier lookups
  const levelInfo = { preset: name, rawValue: rawVal, temp: tempF };

  levelMap[name] = levelInfo; // Map preset name to all info
  levelMap[rawVal] = levelInfo; // Map raw value to all info (for status script)
}
global.set("floorHeatLevelMap", levelMap, "file");

// Device configuration
const componentType = "climate";
const prefix = "floor_heat";
const displayPrefix = "Floor Heat";

// Generate entity identifiers
const entityId = `${prefix}_${instance}`;
const displayName = `${displayPrefix} ${instance}`;

// MQTT topics
const discoveryTopic = `homeassistant/${componentType}/${entityId}/config`;
const stateTopic = `homeassistant/${componentType}/${entityId}/state`;

// MQTT Discovery payload
const payload = {
  name: displayName,
  unique_id: entityId,
  default_entity_id: `${componentType}.${entityId}`,
  icon: "mdi:heating-coil",

  current_temperature_topic: stateTopic,
  current_temperature_template: "{{ value_json.measured_temperature }}",

  mode_state_topic: stateTopic,
  mode_state_template: "{{ value_json.mode }}",

  preset_mode_state_topic: stateTopic,
  preset_mode_value_template: "{{ value_json.preset_mode }}",

  mode_command_topic: `homeassistant/${componentType}/${entityId}/set_mode`,
  modes: ["off", "heat", "auto"], // "auto" is for schedule ON

  preset_mode_command_topic: `homeassistant/${componentType}/${entityId}/set_preset_mode`,
  preset_modes: presetList,

  temperature_unit: "F",

  // Link entities to a common device for better HA grouping
  device: {
    identifiers: ["librecoach-climate"],
    name: "Climate",
    manufacturer: "LibreCoach",
  },
};

// Prepare the final message for the MQTT Out node
const outMsg = {
  topic: discoveryTopic,
  payload: payload,
};

// Return only the climate discovery message
return [[outMsg]];
