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
  custom_name,
  output_custom_name,
  value_min,
  value_max,
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
  "system:/Dc/Vebus/Current": "Inverter/Charger Current",
  "system:/Dc/InverterCharger/Current": "Inverter/Charger DC Current",
  "system:/Ac/Consumption/L1/Power": "AC Consumption L1",
  "system:/Ac/Consumption/L2/Power": "AC Consumption L2",
  "system:/Ac/Grid/L1/Power": "Shore Power L1",
  "system:/Ac/Grid/L2/Power": "Shore Power L2",
  "system:/Ac/ActiveIn/ActiveInput": "Active AC Input",
  "system:/Ac/ActiveIn/Source": "AC Input Source",
  "system:/Dc/System/Power": "DC Loads Power",
  "system:/Dc/Battery/TimeToGo": "Battery Time to Go",
  "system:/SystemState/State": "System State",
  "system:/Ac/Consumption/Total/Power": "AC Consumption Total",
  "system:/Ac/Grid/Total/Power": "Shore Power Total",
  "system:/SwitchableOutput/0/State": "Relay 1",
  "system:/SwitchableOutput/1/State": "Relay 2",
  // battery
  "battery:/Dc/0/Voltage": "Battery Voltage",
  "battery:/Dc/0/Current": "Battery Current",
  "battery:/Dc/0/Power": "Battery Power",
  "battery:/Dc/0/Temperature": "Battery Temperature",
  "battery:/Dc/1/Voltage": "Auxiliary Battery Voltage",
  "battery:/Soc": "Battery SOC",
  "battery:/ConsumedAmphours": "Consumed Amp Hours",
  "battery:/Alarms/LowVoltage": "Low Voltage Alarm",
  // solarcharger
  "solarcharger:/Yield/Power": "Solar Power",
  "solarcharger:/Yield/System": "Solar Total Yield",
  "solarcharger:/History/Daily/0/Yield": "Solar Yield Today",
  "solarcharger:/Dc/0/Voltage": "Solar Battery Voltage",
  "solarcharger:/Dc/0/Current": "Solar Charge Current",
  "solarcharger:/Pv/V": "Solar Panel Voltage",
  "solarcharger:/Pv/I": "Solar Panel Current",
  "solarcharger:/State": "Solar Charger State",
  "solarcharger:/MppOperationMode": "MPPT Mode",
  "solarcharger:/ErrorCode": "Error",
  "solarcharger:/Alarms/Alarm": "Alarm",
  "solarcharger:/Link/VoltageSense": "Shared Voltage Sense",
  // vebus
  "vebus:/Ac/ActiveIn/L1/V": "AC Input L1 Voltage",
  "vebus:/Ac/ActiveIn/L1/I": "AC Input L1 Current",
  "vebus:/Ac/ActiveIn/L1/P": "AC Input L1 Power",
  "vebus:/Ac/ActiveIn/L2/V": "AC Input L2 Voltage",
  "vebus:/Ac/ActiveIn/L2/I": "AC Input L2 Current",
  "vebus:/Ac/ActiveIn/L2/P": "AC Input L2 Power",
  "vebus:/Ac/ActiveIn/L3/I": "AC Input L3 Current",
  "vebus:/Ac/Out/L1/V": "AC Output L1 Voltage",
  "vebus:/Ac/Out/L1/I": "AC Output L1 Current",
  "vebus:/Ac/Out/L1/P": "AC Output L1 Power",
  "vebus:/Ac/Out/L2/V": "AC Output L2 Voltage",
  "vebus:/Ac/Out/L2/I": "AC Output L2 Current",
  "vebus:/Ac/Out/L2/P": "AC Output L2 Power",
  "vebus:/Ac/Out/L3/I": "AC Output L3 Current",
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
  "vebus:/Dc/0/ChargePower": "Charge Power",
  "vebus:/Dc/0/InverterPower": "Inverter Power",
  "vebus:/TotalOutputPower": "Total Output Power",
  "vebus:/Ac/ActiveIn/Connected": "Shore Power Connected",
  "vebus:/Alarms/LowBattery": "Low Battery Alarm",
  "vebus:/Alarms/Overload": "Overload Alarm",
  "vebus:/Alarms/HighTemperature": "High Temperature Alarm",
  // charger
  "charger:/Dc/0/Voltage": "Output Voltage",
  "charger:/Dc/0/Current": "Output Current",
  "charger:/Dc/1/Current": "Output 2 Current",
  "charger:/Dc/2/Current": "Output 3 Current",
  "charger:/Ac/In/L1/I": "AC Input Current",
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
  "alternator:/DeviceOffReason": "Off Reason",
  "alternator:/Link/VoltageSense": "Shared Voltage Sense",
  // dcdc
  "dcdc:/Dc/0/Voltage": "Output Voltage",
  "dcdc:/Dc/0/Current": "Output Current",
  "dcdc:/Dc/0/Power": "Output Power",
  "dcdc:/Dc/In/V": "Input Voltage",
  "dcdc:/Dc/In/I": "Input Current",
  "dcdc:/Dc/In/P": "Input Power",
  "dcdc:/State": "Charge State",
  "dcdc:/DeviceOffReason": "Off Reason",
  "dcdc:/Link/VoltageSense": "Shared Voltage Sense",
  // generator (GX generator start/stop service)
  "generator:/State": "State",
  "generator:/Error": "Error",
  "generator:/ManualStart": "Manual Start",
  "generator:/AutoStartEnabled": "Auto Start",
  "generator:/Runtime": "Runtime",
  "generator:/TodayRuntime": "Runtime Today",
  "generator:/AccumulatedRuntime": "Total Runtime",
  "generator:/ServiceCounter": "Service Counter",
  "generator:/RunningByConditionCode": "Running By Condition",
  "generator:/Alarms/NoGeneratorAtAcIn": "No Generator at AC Input Alarm",
  // grid
  "grid:/Ac/L1/Power": "L1 Power",
  "grid:/Ac/L2/Power": "L2 Power",
  "grid:/Ac/Power": "Total Power",
  "grid:/Ac/L1/Current": "L1 Current",
  "grid:/Ac/L2/Current": "L2 Current",
  "grid:/Ac/L3/Current": "L3 Current",
  // acload
  "acload:/Ac/L1/Power": "L1 Power",
  "acload:/Ac/L2/Power": "L2 Power",
  "acload:/Ac/Power": "Total Power",
  "acload:/Ac/L1/Current": "L1 Current",
  "acload:/Ac/L2/Current": "L2 Current",
  "acload:/Ac/L3/Current": "L3 Current",
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
// CamelCase D-Bus segments collapse into unreadable ids once lowercased, so
// split them back into words. Must match victron_status.
const wordSplits = {
  chargepower: "charge_power",
  inverterpower: "inverter_power",
  totaloutputpower: "total_output_power",
  manualstart: "manual_start",
  autostartenabled: "auto_start_enabled",
  accumulatedruntime: "accumulated_runtime",
  todayruntime: "today_runtime",
  servicecounter: "service_counter",
  runningbyconditioncode: "running_by_condition_code",
  mppoperationmode: "mpp_operation_mode",
  errorcode: "error_code",
  nogeneratoratacin: "no_generator_at_ac_in",
  deviceoffreason: "device_off_reason",
  voltagesense: "voltage_sense",
};
for (const [from, to] of Object.entries(wordSplits)) {
  safePath = safePath.replace(from, to);
}
// The GX exposes its relays under both the legacy /Relay/ tree and the newer
// /SwitchableOutput/ tree. We read and write the new path but keep the legacy
// entity id, so existing switches, automations and renames are undisturbed.
safePath = safePath.replace(/^switchableoutput_(\d+)_state$/, "relay_$1_state");
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

// The GX CustomName is what distinguishes devices that share a ProductName —
// four Orion XS chargers all report "Orion XS", but are named "Orion XS 1".."4".
// Use it verbatim; trailing digits are the whole point. Fall back to the first
// two alpha words of the product name (skip model numbers) when unset.
const displayName = custom_name
  ? custom_name
  : product_name
    ? product_name
        .split(/\s+/)
        .filter((w) => /^[a-zA-Z]/.test(w))
        .slice(0, 2)
        .join(" ")
    : "";

// Prefix with device display name, for example "MultiPlus-II - Inverter DC Power".
// Services whose product name is a description rather than a device name get a
// fixed prefix ("Generator start/stop" -> "Generator"), but a name the user set
// on the GX outranks it.
// The system service is the GX's aggregated view — its readings come from the
// battery monitor, meters and chargers, so "System" is right for them. The
// switchable outputs are the GX's own relays, where that prefix misleads.
const fixedPrefixes = { system: "System", generator: "Generator" };
const prefix = dbus_path.startsWith("/SwitchableOutput/")
  ? "GX"
  : custom_name || fixedPrefixes[service_type] || displayName;
const outputName = output_custom_name || baseName;
const friendlyName = prefix ? `${prefix} — ${outputName}` : outputName;

const effectiveUnit = unit || "";

// Two-state writable enums that belong in HA as switches rather than selects,
// with the value each state writes. Charger /Mode is 1=On/4=Off, so payload_off
// is not simply 0. VE.Bus /Mode is absent here — it has four states and stays a
// select. Must match the component-type choice in victron_status.
const switchPaths = {
  "generator:/ManualStart": { on: "1", off: "0" },
  "generator:/AutoStartEnabled": { on: "1", off: "0" },
};

const switchSpec =
  switchPaths[`${service_type}:${dbus_path}`] ||
  (/\/(Relay|SwitchableOutput)\//.test(dbus_path)
    ? { on: "1", off: "0" }
    : null);

// === Determine HA Metadata ===

let haMetadata = unitMap[effectiveUnit];
let isEnum = false;

// Check if unit is an enum string (e.g., "0=Off;1=On;2=Error")
if (!haMetadata && effectiveUnit && effectiveUnit.includes("=")) {
  isEnum = true;
  haMetadata = {
    device_class: null,
    unit: null,
    icon: switchSpec ? "mdi:toggle-switch-outline" : "mdi:information-outline",
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

// Parse the enum once — both the component-type choice and the state template
// below depend on how many states it has.
const enumMappings = {};
if (isEnum) {
  for (const part of effectiveUnit.split(";")) {
    const [val, label] = part.split("=");
    if (val !== undefined && label !== undefined) {
      enumMappings[val.trim()] = label.trim();
    }
  }
}

// A read-only enum with exactly two states, one of them zero, is a boolean
// dressed as text. Venus uses zero for the normal state throughout, so the
// non-zero key is the active one.
const binarySpec = (() => {
  if (!isEnum || writable) return null;
  const keys = Object.keys(enumMappings);
  if (keys.length !== 2 || !keys.includes("0")) return null;
  return { on: keys.find((k) => k !== "0") };
})();

// === Determine HA Component Type ===

let componentType = "sensor";
if (dbus_path.endsWith("/CurrentLimit")) {
  componentType = "number";
} else if (binarySpec) {
  componentType = "binary_sensor";
} else if (writable && isEnum) {
  componentType = switchSpec ? "switch" : "select";
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
  qos: 1,
  default_entity_id: buildDefaultEntityId(),
  icon: haMetadata.icon,
  state_topic: stateTopic,
  value_template: "{{ (value_json | default({'value': ''})).value }}",
  availability_mode: "all",
  availability: [
    {
      topic: "librecoach/nodered/status",
      payload_available: "online",
      payload_not_available: "offline",
    },
    {
      topic: "librecoach/victron/status",
      payload_available: "online",
      payload_not_available: "offline",
    },
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
  payload.payload_on = switchSpec.on;
  payload.payload_off = switchSpec.off;
  payload.state_on = "ON";
  payload.state_off = "OFF";
  payload.optimistic = false;
  payload.value_template = `{{ 'ON' if (value_json | default({'value': 0})).value | int == ${switchSpec.on} else 'OFF' }}`;
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

  // A range reported by Venus describes this installation's actual hardware,
  // so it outranks every default above.
  if (typeof value_min === "number") payload.min = value_min;
  if (typeof value_max === "number") payload.max = value_max;
} else if (componentType === "binary_sensor") {
  payload.payload_on = binarySpec.on;
  payload.payload_off = "0";
  payload.value_template =
    "{{ (value_json | default({'value': 0})).value | int }}";
  if (dbus_path.includes("/Alarms/")) {
    payload.device_class = "problem";
  } else if (dbus_path.endsWith("/Connected")) {
    payload.device_class = "plug";
  }
  delete payload.icon;
}

// Add device_class if defined
if (haMetadata.device_class && componentType !== "select") {
  payload.device_class = haMetadata.device_class;
  // Energy counters must be total_increasing to qualify for HA's Energy
  // dashboard; resets (e.g. daily yield at midnight) are handled natively.
  payload.state_class =
    haMetadata.device_class === "energy" ? "total_increasing" : "measurement";
}

// Add unit_of_measurement if defined (excluding select)
if (haMetadata.unit && componentType !== "select") {
  payload.unit_of_measurement = haMetadata.unit;
}

// Apply precision formatting for numeric values, excluding switches, selects,
// and enum sensors (which get a label-mapping template below).
if (!isEnum && (componentType === "sensor" || componentType === "number")) {
  // Default to 1 decimal place if not specified
  const precision =
    haMetadata.precision !== undefined ? haMetadata.precision : 1;
  payload.value_template = `{{ (value_json | default({'value': 0})).value | float | round(${precision}) }}`;
}

// Time to Go arrives in seconds; report it in hours for readability. The
// decoder sends a non-numeric marker while charging (Venus publishes null),
// which renders as unknown here.
if (dbus_path === "/Dc/Battery/TimeToGo") {
  payload.unit_of_measurement = "h";
  payload.value_template = `{% set v = (value_json | default({'value': none})).value %}{{ (v | float / 3600) | round(1) if v is number else None }}`;
}

// DeviceOffReason is a bit-mask rather than a single enumerated value, so it
// needs a template that joins every reason whose bit is set. Bits are per the
// Orion XS VE.Direct HEX protocol, register 0x0207, where bits 1 and 9 are
// documented as not applicable. Labels are shortened from the spec wording so
// that two simultaneous reasons still fit a dashboard row.
if (dbus_path === "/DeviceOffReason") {
  const offReasonBits = {
    1: "No input",
    4: "Switched off",
    8: "Remote",
    16: "Internal",
    32: "PAYG",
    64: "BMS",
    128: "Engine off",
    256: "Error",
  };
  const pairs = Object.entries(offReasonBits)
    .map(([bit, label]) => `(${bit}, '${label}')`)
    .join(", ");
  payload.value_template =
    `{% set v = (value_json | default({'value': 0})).value | int %}` +
    `{% set ns = namespace(r=[]) %}` +
    `{% for bit, label in [${pairs}] %}` +
    `{% if v | bitwise_and(bit) %}{% set ns.r = ns.r + [label] %}{% endif %}` +
    `{% endfor %}` +
    `{{ ns.r | join(', ') if ns.r else 'None' }}`;
}

// For enum values, build a Jinja2 template to map numeric values to labels.
// Applies to selects and to read-only enum sensors (states, alarms).
if (isEnum && componentType !== "switch" && componentType !== "binary_sensor") {
  // Build Jinja2 map template
  const mapEntries = Object.entries(enumMappings)
    .map(([k, v]) => `'${k}': '${v}'`)
    .join(", ");
  // Values arrive as numbers (possibly decoded as floats); normalize to a
  // whole-number string so keys like '9' match.
  payload.value_template = `{% set vj = value_json | default({'value': ''}) %}{% set m = {${mapEntries}} %}{{ m.get(vj.value | int(-1) | string, vj.value) }}`;

  if (componentType === "select") {
    payload.options = Object.values(enumMappings);
  }
}

// LibreCoach surfaces what a coach owner operates, not what an installer
// configures or a technician troubleshoots. Paths below leave the primary
// dashboard, and are not created at all until someone enables them.
const diagnosticPaths = [
  "/DeviceOffReason",
  "/Link/VoltageSense",
  "/MppOperationMode",
  "/ErrorCode",
  "/Error",
  "/ServiceCounter",
  "/RunningByConditionCode",
];
if (diagnosticPaths.includes(dbus_path)) {
  payload.entity_category = "diagnostic";
  payload.enabled_by_default = false;
}

// Republish the discovery config only when its payload changes.
const sigKey = `victron_${entityId}_dsig`;
const signature = JSON.stringify(payload);
if (global.get(sigKey, "file") === signature) {
  return null;
}
global.set(sigKey, signature, "file");

// Prepare final message
msg.topic = discoveryTopic;
msg.payload = payload;
msg.stateTopic = stateTopic;

// Send cleanup payloads for obsolete component types so they don't linger in HA
if (dbus_path.endsWith("/CurrentLimit")) {
  node.send({ topic: `homeassistant/select/${entityId}/config`, payload: "" });
  node.send({ topic: `homeassistant/sensor/${entityId}/config`, payload: "" });
} else if (/\/(Relay|SwitchableOutput)\//.test(dbus_path)) {
  node.send({ topic: `homeassistant/sensor/${entityId}/config`, payload: "" });
} else if (switchSpec) {
  node.send({ topic: `homeassistant/select/${entityId}/config`, payload: "" });
  node.send({ topic: `homeassistant/sensor/${entityId}/config`, payload: "" });
} else if (componentType === "binary_sensor") {
  node.send({ topic: `homeassistant/sensor/${entityId}/config`, payload: "" });
}

return msg;
