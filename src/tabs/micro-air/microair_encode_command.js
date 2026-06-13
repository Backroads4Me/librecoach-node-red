// Encode MicroAir Command to MQTT
// Input: HA command payload (string or number)
// Topic determines command type: .../mode/set, .../temp/set, .../fan/set
// Reads cached zone state from global context for mode-aware encoding

const topic = msg.topic;
const parts = topic.split("/");
// Expected: homeassistant/climate/microair_{safeMac}_zone_{z}/{cmd}/set

// 1. Extract Entity ID
const entityPart = parts[2]; // microair_{safeMac}_zone_{z}
if (!entityPart || !entityPart.startsWith("microair_")) return null;

const subParts = entityPart.split("_");
// microair, 78, e3, 6d, fc, 5e, ce, zone, {z}
const zoneIdx = subParts.indexOf("zone");
if (zoneIdx < 2) return null;

const safeMac = subParts.slice(1, zoneIdx).join("_");
const mac = subParts.slice(1, zoneIdx).join(":");
const zone = parseInt(subParts[zoneIdx + 1]);

if (!mac || isNaN(zone)) return null;

// Read cached zone state for mode-aware encoding
const cached = global.get(`microair_${safeMac}_zone_${zone}`, "file") || {};
const currentMode = cached.mode || "off";
const currentModeNum = cached.mode_num || 0;

// Read observed max fan speed for dynamic mapping
const maxFanSpeed =
  global.get(`microair_${safeMac}_zone_${zone}_maxfan`, "file") || 2;

// 2. Determine Command Type
let change = {};
let val = msg.payload;

const MODE_MAP = {
  off: 0,
  fan_only: 1,
  cool: 2,
  heat: 5,
  auto: 11,
};

// Dynamic fan map based on observed speed count
const FAN_MAP =
  maxFanSpeed >= 3
    ? { low: 1, medium: 2, high: 3, auto: 128 } // 3-speed
    : { low: 1, high: 2, auto: 128 }; // 2-speed

if (topic.endsWith("/mode/set")) {
  // HA sends: "cool", "heat", "off", etc.
  if (val in MODE_MAP) {
    let modeNum = MODE_MAP[val];
    // Preserve last-used heat type when switching back to heat mode
    if (val === "heat") {
      const lastHeat = global.get(
        `microair_${safeMac}_zone_${zone}_lastheat`,
        "file",
      );
      if (lastHeat) {
        modeNum = lastHeat;
      }
    }
    change.mode = modeNum;
    change.power = 1;
  } else {
    return null;
  }
} else if (topic.endsWith("/temp/set")) {
  // HA sends number: 72
  // Set only the setpoint for the current HVAC mode
  const temp = parseFloat(val);
  if (currentMode === "cool") {
    change.cool_sp = temp;
  } else if (currentMode === "heat") {
    change.heat_sp = temp;
  } else if (currentMode === "auto") {
    // HA MQTT climate sends a single temp for auto mode via this topic.
    // Set both setpoints — HA should use temp_high/temp_low topics for
    // separate auto setpoints, but fallback keeps behavior reasonable.
    change.autoCool_sp = temp;
    change.autoHeat_sp = temp;
  } else {
    // Fallback: set cool_sp as default
    change.cool_sp = temp;
  }
} else if (topic.endsWith("/temp_high/set")) {
  // Auto mode high setpoint (cool target)
  change.autoCool_sp = parseFloat(val);
} else if (topic.endsWith("/temp_low/set")) {
  // Auto mode low setpoint (heat target)
  change.autoHeat_sp = parseFloat(val);
} else if (topic.endsWith("/preset/set")) {
  // HA sends: "Heat Pump", "Furnace", "Gas Furnace", etc.
  const PRESET_MAP = {
    "Heat Pump": 5,
    Furnace: 4,
    "Gas Furnace": 3,
    "Heat Strip": 7,
    "Electric Heat": 12,
  };
  if (val in PRESET_MAP) {
    change.mode = PRESET_MAP[val];
    change.power = 1;
    // Set the correct fan field for this heat type
    const fanNum =
      change.mode === 3 || change.mode === 4
        ? cached.furnace_fan_mode_num || 128
        : cached.heat_fan_mode_num || 128;
    if (change.mode === 3 || change.mode === 4) {
      change.gasFan = fanNum;
    } else {
      change.eleFan = fanNum;
    }
  } else {
    return null;
  }
} else if (topic.endsWith("/fan/set")) {
  // HA sends: "low", "high", "medium", "auto"
  if (!(val in FAN_MAP)) return null;

  const fanValue = FAN_MAP[val];

  // Use mode-specific fan key based on current HVAC mode
  if (currentMode === "fan_only") {
    // Fan-only mode doesn't support auto — default to max speed
    change.fanOnly = fanValue === 128 ? maxFanSpeed : fanValue;
  } else if (currentMode === "cool") {
    change.coolFan = fanValue;
  } else if (currentMode === "heat") {
    // Gas furnace (mode 3,4) vs electric heat (mode 5,6,7,12)
    if (currentModeNum === 3 || currentModeNum === 4) {
      change.gasFan = fanValue;
    } else {
      change.eleFan = fanValue;
    }
  } else if (currentMode === "auto") {
    change.autoFan = fanValue;
  } else {
    // Fallback: use coolFan
    change.coolFan = fanValue;
  }
} else {
  // Unknown topic suffix
  return null;
}

change.zone = zone;

// 3. Construct Bridge Message
msg.payload = {
  Type: "Change",
  Changes: change,
};
msg.topic = `librecoach/ble/microair/${mac}/set`;

return msg;
