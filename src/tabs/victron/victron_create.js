// Creates Sensor entity for Victron via MQTT Discovery

// Validate input structure
if (!msg.payload || typeof msg.payload !== "object") {
  node.error("Input payload must be an object.", msg);
  return null;
}

const {
  service_type,
  instance,
  dbus_path,
  unit,
  short_name,
  product_name,
  writable,
} = msg.payload;

// Validate required fields
if (!service_type || !instance || !dbus_path) {
  node.error("Input missing service_type, instance, or dbus_path.", msg);
  return null;
}

// === Unit to HA Metadata Mapping ===

const unitMap = {
  "V DC": {
    device_class: "voltage",
    unit: "V",
    icon: "mdi:flash",
    precision: 1,
  },
  "V AC": {
    device_class: "voltage",
    unit: "V",
    icon: "mdi:flash",
    precision: 1,
  },
  "A DC": { device_class: "current", unit: "A", icon: "mdi:current-dc" },
  "A AC": { device_class: "current", unit: "A", icon: "mdi:current-ac" },
  A: { device_class: "current", unit: "A", icon: "mdi:current-ac" },
  W: { device_class: "power", unit: "W", icon: "mdi:flash" },
  kWh: { device_class: "energy", unit: "kWh", icon: "mdi:lightning-bolt" },
  Ah: { device_class: null, unit: "Ah", icon: "mdi:battery-charging" },
  "%": { device_class: "battery", unit: "%", icon: "mdi:battery" },
  "Degrees celsius": {
    device_class: "temperature",
    unit: "°C",
    icon: "mdi:thermometer",
  },
  "Degrees Celsius": {
    device_class: "temperature",
    unit: "°C",
    icon: "mdi:thermometer",
  },
  Hz: { device_class: "frequency", unit: "Hz", icon: "mdi:sine-wave" },
  "m/s": { device_class: "speed", unit: "m/s", icon: "mdi:speedometer" },
  RPM: { device_class: null, unit: "RPM", icon: "mdi:engine" },
  seconds: { device_class: "duration", unit: "s", icon: "mdi:timer" },
  VA: { device_class: "apparent_power", unit: "VA", icon: "mdi:flash" },
  L: { device_class: null, unit: "L", icon: "mdi:cup-water" },
  "%RH": { device_class: "humidity", unit: "%", icon: "mdi:water-percent" },
  "%level": { device_class: null, unit: "%", icon: "mdi:gauge" },
};

// === Friendly Name Map ===
// Maps service_type + dbus_path to clean dashboard names.

const friendlyNameMap = {
  // system/0 — GX device data
  "system:/Dc/Battery/Soc": "Battery State of Charge",
  "system:/Dc/Battery/Voltage": "Battery Voltage",
  "system:/Dc/Battery/Current": "Battery Current",
  "system:/Dc/Battery/Power": "Battery Power",
  "system:/Dc/Battery/Temperature": "Battery Temperature",
  "system:/Dc/Pv/Power": "Solar Power",
  "system:/Dc/Pv/Current": "Solar Current",
  "system:/Ac/Consumption/L1/Power": "AC Consumption L1",
  "system:/Ac/Consumption/L2/Power": "AC Consumption L2",
  "system:/Ac/Grid/L1/Power": "Shore Power L1",
  "system:/Ac/Grid/L2/Power": "Shore Power L2",
  "system:/Ac/ActiveIn/ActiveInput": "Active AC Input",
  "system:/Ac/ActiveIn/Source": "AC Input Source",
  "system:/Dc/System/Power": "DC Loads Power",
  "system:/Ac/Consumption/Total/Power": "AC Consumption Total",
  "system:/Ac/Grid/Total/Power": "Shore Power Total",
  "system:/Relay/0/State": "Relay 1",
  "system:/Relay/1/State": "Relay 2",
  // battery
  "battery:/Dc/0/Voltage": "Battery Voltage",
  "battery:/Dc/0/Current": "Battery Current",
  "battery:/Dc/0/Power": "Battery Power",
  "battery:/Dc/0/Temperature": "Battery Temperature",
  "battery:/Dc/1/Voltage": "Auxiliary Battery Voltage",
  "battery:/Soc": "Battery SOC",
  // solarcharger
  "solarcharger:/Yield/Power": "Solar Power",
  "solarcharger:/Yield/System": "Solar Total Yield",
  "solarcharger:/Dc/0/Voltage": "Solar Battery Voltage",
  "solarcharger:/Dc/0/Current": "Solar Charge Current",
  "solarcharger:/Pv/V": "Solar Panel Voltage",
  "solarcharger:/State": "Solar Charger State",
  // vebus
  "vebus:/Ac/ActiveIn/L1/V": "AC Input L1 Voltage",
  "vebus:/Ac/ActiveIn/L1/I": "AC Input L1 Current",
  "vebus:/Ac/ActiveIn/L1/P": "AC Input L1 Power",
  "vebus:/Ac/ActiveIn/L2/V": "AC Input L2 Voltage",
  "vebus:/Ac/ActiveIn/L2/I": "AC Input L2 Current",
  "vebus:/Ac/ActiveIn/L2/P": "AC Input L2 Power",
  "vebus:/Ac/Out/L1/V": "AC Output L1 Voltage",
  "vebus:/Ac/Out/L1/I": "AC Output L1 Current",
  "vebus:/Ac/Out/L1/P": "AC Output L1 Power",
  "vebus:/Ac/Out/L2/V": "AC Output L2 Voltage",
  "vebus:/Ac/Out/L2/I": "AC Output L2 Current",
  "vebus:/Ac/Out/L2/P": "AC Output L2 Power",
  "vebus:/Ac/ActiveIn/Total/P": "AC Input Total Power",
  "vebus:/Ac/Out/Total/P": "AC Output Total Power",
  "vebus:/Ac/ActiveIn/CurrentLimit": "Shore Power Limit",
  "vebus:/Ac/ActiveIn/L1/F": "AC Input Frequency",
  "vebus:/Dc/0/Voltage": "Inverter DC Voltage",
  "vebus:/Dc/0/Current": "Inverter DC Current",
  "vebus:/Dc/0/Power": "Inverter DC Power",
  "vebus:/Dc/0/Temperature": "Inverter Temperature",
  "vebus:/State": "Inverter State",
  "vebus:/Mode": "Inverter Mode",
  "vebus:/Relay/0/State": "Inverter Relay",
  // charger
  "charger:/Dc/0/Voltage": "Output Voltage",
  "charger:/Dc/0/Current": "Output Current",
  "charger:/Ac/In/L1/P": "AC Input Power",
  "charger:/State": "Charge State",
  // alternator (Orion XS DC-DC)
  "alternator:/Dc/0/Voltage": "Output Voltage",
  "alternator:/Dc/0/Current": "Output Current",
  "alternator:/Dc/0/Power": "Output Power",
  "alternator:/Dc/In/V": "Input Voltage",
  "alternator:/Dc/In/I": "Input Current",
  "alternator:/Dc/In/P": "Input Power",
  "alternator:/State": "Charge State",
  // dcdc
  "dcdc:/Dc/0/Voltage": "Output Voltage",
  "dcdc:/Dc/0/Current": "Output Current",
  "dcdc:/Dc/0/Power": "Output Power",
  "dcdc:/Dc/In/V": "Input Voltage",
  "dcdc:/Dc/In/I": "Input Current",
  "dcdc:/Dc/In/P": "Input Power",
  "dcdc:/State": "Charge State",
  // grid
  "grid:/Ac/L1/Power": "L1 Power",
  "grid:/Ac/L2/Power": "L2 Power",
  "grid:/Ac/Power": "Total Power",
  // acload
  "acload:/Ac/L1/Power": "L1 Power",
  "acload:/Ac/L2/Power": "L2 Power",
  "acload:/Ac/Power": "Total Power",
  // tank
  "tank:/Level": "Level",
  "tank:/Remaining": "Remaining",
  "tank:/FluidType": "Fluid Type",
  // temperature
  "temperature:/Temperature": "Temperature",
  "temperature:/Humidity": "Humidity",
  // digitalinput
  "digitalinput:/InputState": "State",
  "digitalinput:/Count": "Count",
};

// === Build Entity ID ===

// Convert dbus_path to safe ID component: /Dc/0/Voltage -> _dc_0_voltage
let safePath = dbus_path.replace(/^\//, "").replace(/\//g, "_").toLowerCase();

// === Standardization Rules ===

// 1. Context-aware renaming (only if direction is discernible)
// Map "dc_0" to "dc_out" for output-generating devices
if (
  ["charger", "dcdc", "alternator"].includes(service_type) &&
  safePath.includes("dc_0")
) {
  safePath = safePath.replace("dc_0", "dc_out");
}
// Note: solarcharger usually outputs to battery, but has "pv" as well.
// "dc_0" on solarcharger is battery connection (output).
if (service_type === "solarcharger" && safePath.includes("dc_0")) {
  safePath = safePath.replace("dc_0", "dc_out");
}

// 2. Term normalization
safePath = safePath.replace("_activein", "_in");
safePath = safePath.replace("_active_in", "_in");
safePath = safePath.replace("_active_input", "_in");

// 3. Suffix expansion (single letters)
if (safePath.endsWith("_p")) {
  safePath = safePath.slice(0, -2) + "_power";
} else if (safePath.endsWith("_v")) {
  safePath = safePath.slice(0, -2) + "_voltage";
} else if (safePath.endsWith("_i")) {
  safePath = safePath.slice(0, -2) + "_current";
} else if (safePath.endsWith("_f")) {
  safePath = safePath.slice(0, -2) + "_frequency";
}

// 4. Specific "total_power" enforcement
if (safePath.endsWith("_total_p")) {
  safePath = safePath.replace(/_total_p$/, "_total_power");
} else if (safePath.endsWith("_ac_power")) {
  safePath = safePath.replace(/_ac_power$/, "_ac_total_power");
} else if (safePath === "ac_power") {
  safePath = "ac_total_power";
}

// Use product short name in entity ID (e.g., smartshunt instead of battery)
const deviceName = short_name || service_type;
const entityId = `victron_${deviceName}_${instance}_${safePath}`;

// === Build Friendly Name ===

const nameKey = `${service_type}:${dbus_path}`;
const baseName =
  friendlyNameMap[nameKey] ||
  dbus_path
    .replace(/^\//, "")
    .replace(/\//g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2");

// Build short display name from first two alpha words of product name
const displayName = product_name
  ? product_name
    .split(/\s+/)
    .filter((w) => /^[a-zA-Z]/.test(w))
    .slice(0, 2)
    .join(" ")
  : "";

// Prefix with device display name, for example "MultiPlus-II - Inverter DC Power".
// System service uses "System" prefix instead of product name.
const prefix = service_type === "system" ? "System" : displayName;
const friendlyName = prefix ? `${prefix} — ${baseName}` : baseName;

// === Unit Override for Paths Missing from Victron CSV ===

const unitOverrides = {
  "/Dc/0/Power": "W",
  "/Dc/0/Voltage": "V DC",
  "/Dc/0/Current": "A DC",
  "/Dc/0/Temperature": "Degrees celsius",
  "/Dc/In/V": "V DC",
  "/Dc/In/I": "A DC",
  "/Dc/In/P": "W",
  "/Ac/In/L1/P": "W",
  "/Ac/L1/Power": "W",
  "/Ac/L2/Power": "W",
  "/Ac/Power": "W",
  "/Level": "%level",
  "/Remaining": "L",
  "/Temperature": "Degrees celsius",
  "/Humidity": "%RH",
  // vebus paths (whitelisted but may not all appear in Victron CSV)
  "/Ac/ActiveIn/L1/V": "V AC",
  "/Ac/ActiveIn/L1/I": "A AC",
  "/Ac/ActiveIn/L1/P": "W",
  "/Ac/ActiveIn/L2/V": "V AC",
  "/Ac/ActiveIn/L2/I": "A AC",
  "/Ac/ActiveIn/L2/P": "W",
  "/Ac/ActiveIn/Total/P": "W",
  "/Ac/ActiveIn/L1/F": "Hz",
  "/Ac/ActiveIn/CurrentLimit": "A",
  "/Ac/Out/L1/V": "V AC",
  "/Ac/Out/L1/I": "A AC",
  "/Ac/Out/L1/P": "W",
  "/Ac/Out/L2/V": "V AC",
  "/Ac/Out/L2/I": "A AC",
  "/Ac/Out/L2/P": "W",
  "/Ac/Out/Total/P": "W",
  // System service paths (synthesized by GX, not in Victron CSV)
  "/Dc/Battery/Voltage": "V DC",
  "/Dc/Battery/Current": "A DC",
  "/Dc/Battery/Power": "W",
  "/Dc/Battery/Soc": "%",
  "/Dc/Battery/Temperature": "Degrees celsius",
  "/Dc/Pv/Power": "W",
  "/Dc/Pv/Current": "A DC",
  "/Dc/System/Power": "W",
  "/Ac/Consumption/L1/Power": "W",
  "/Ac/Consumption/L2/Power": "W",
  "/Ac/Consumption/Total/Power": "W",
  "/Ac/Grid/L1/Power": "W",
  "/Ac/Grid/L2/Power": "W",
  "/Ac/Grid/Total/Power": "W",
};

const effectiveUnit = unit || unitOverrides[dbus_path] || "";

// === Determine HA Metadata ===

let haMetadata = unitMap[effectiveUnit];
let isEnum = false;

// Check if unit is an enum string (e.g., "0=Off;1=On;2=Error")
if (!haMetadata && effectiveUnit && effectiveUnit.includes("=")) {
  isEnum = true;
  haMetadata = {
    device_class: null,
    unit: null,
    icon: dbus_path.includes("/Relay/")
      ? "mdi:toggle-switch-outline"
      : "mdi:information-outline",
  };
}

// Fallback for unknown units
if (!haMetadata) {
  haMetadata = {
    device_class: null,
    unit: effectiveUnit || null,
    icon: "mdi:information-outline",
  };
}

// === Determine HA Component Type ===

let componentType = "sensor";
if (dbus_path.endsWith("/CurrentLimit")) {
  componentType = "number";
} else if (writable && isEnum) {
  if (dbus_path.includes("/Relay/")) {
    componentType = "switch";
  } else {
    componentType = "select";
  }
} else if (writable && !isEnum) {
  componentType = "number";
}

// === Build Discovery Topic and State Topic ===

const discoveryTopic = `homeassistant/${componentType}/${entityId}/config`;
const stateTopic = `homeassistant/${componentType}/${entityId}/state`;

function buildDefaultEntityId() {
  const objectId = `librecoach_${entityId}`
    .replace(/-/g, "_")
    .replace(/_currentlimit(?=$|_)/g, "_current_limit")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `${componentType}.${objectId}`;
}

// === Build Discovery Payload ===

const payload = {
  name: friendlyName,
  unique_id: entityId,
  default_entity_id: buildDefaultEntityId(),
  icon: haMetadata.icon,
  state_topic: stateTopic,
  value_template: "{{ value_json.value }}",
  availability_mode: "all",
  availability: [
    { topic: "librecoach/nodered/status", payload_available: "online", payload_not_available: "offline" },
    { topic: "librecoach/victron/status", payload_available: "online", payload_not_available: "offline" },
  ],
  device: {
    identifiers: ["librecoach-victron"],
    name: "Victron",
    manufacturer: "LibreCoach",
  },
};

// Add component-specific parameters
if (
  componentType === "number" ||
  componentType === "select" ||
  componentType === "switch"
) {
  payload.command_topic = `librecoach/victron/set/${service_type}/${instance}${dbus_path}`;
  payload.optimistic = true;
}

if (componentType === "switch") {
  payload.payload_on = "1";
  payload.payload_off = "0";
  payload.state_on = "ON";
  payload.state_off = "OFF";
  payload.optimistic = false;
  payload.value_template =
    "{{ 'ON' if value_json.value | int == 1 else 'OFF' }}";
} else if (componentType === "number") {
  // Safe defaults for unknown numeric writable paths
  payload.min = 0;
  payload.max = 100;
  payload.step = 0.5;

  // Specific overrides based on path
  if (dbus_path.endsWith("/Soc")) {
    payload.max = 100;
    payload.step = 1;
  } else if (dbus_path.endsWith("/CurrentLimit")) {
    payload.max = 100;
    payload.step = 0.5;
    payload.mode = "box";
  }
}

// Add device_class if defined
if (haMetadata.device_class && componentType !== "select") {
  payload.device_class = haMetadata.device_class;
  payload.state_class = "measurement";
}

// Add unit_of_measurement if defined (excluding select)
if (haMetadata.unit && componentType !== "select") {
  payload.unit_of_measurement = haMetadata.unit;
}

// Apply precision formatting for numeric values, excluding switches and selects.
if (componentType === "sensor" || componentType === "number") {
  // Default to 1 decimal place if not specified
  const precision =
    haMetadata.precision !== undefined ? haMetadata.precision : 1;
  payload.value_template = `{{ value_json.value | float | round(${precision}) }}`;
}

// For enum values, build a Jinja2 template to map numeric values to labels
if (isEnum && componentType === "select") {
  const enumParts = effectiveUnit.split(";").map((p) => p.trim());
  const mappings = {};
  for (const part of enumParts) {
    const [val, label] = part.split("=");
    if (val !== undefined && label !== undefined) {
      mappings[val.trim()] = label.trim();
    }
  }

  // Build Jinja2 map template
  const mapEntries = Object.entries(mappings)
    .map(([k, v]) => `'${k}': '${v}'`)
    .join(", ");
  payload.value_template = `{% set m = {${mapEntries}} %}{{ m.get(value_json.value | string, value_json.value) }}`;

  if (componentType === "select") {
    payload.options = Object.values(mappings);
  }
}

// Track discovery topic for cleanup on disable (file store — survives restarts)
let discoveryTopics = global.get("victronDiscoveryTopics", "file") || [];
if (!discoveryTopics.includes(discoveryTopic)) {
  discoveryTopics.push(discoveryTopic);
  global.set("victronDiscoveryTopics", discoveryTopics, "file");
}

// Prepare final message
msg.topic = discoveryTopic;
msg.payload = payload;
msg.stateTopic = stateTopic;

// Send cleanup payloads for obsolete component types so they don't linger in HA
if (dbus_path.endsWith("/CurrentLimit")) {
  node.send({ topic: `homeassistant/select/${entityId}/config`, payload: "" });
  node.send({ topic: `homeassistant/sensor/${entityId}/config`, payload: "" });
} else if (dbus_path.includes("/Relay/")) {
  node.send({ topic: `homeassistant/sensor/${entityId}/config`, payload: "" });
}

return msg;
