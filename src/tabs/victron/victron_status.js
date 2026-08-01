// HA Status Updater for Victron

const incomingPayload = msg.payload;

// Gate: skip null/undefined/empty values
if (
  incomingPayload.value === null ||
  incomingPayload.value === undefined ||
  incomingPayload.value === ""
) {
  return null;
}

const { service_type, instance, dbus_path, value, unit, writable } =
  incomingPayload;

// 1. Context-Aware Rounding (Filter Logic)
let roundedValue = value;
if (typeof value === "number") {
  // Round SOC to whole numbers, everything else to 1 decimal
  const decimals = dbus_path.toLowerCase().includes("soc") ? 0 : 1;
  const factor = Math.pow(10, decimals);
  roundedValue = Math.round(value * factor) / factor;
}

// 2. Report by Exception (Filter Logic)
const lastValues = context.get("lastValues") || {};
const publishedState = context.get("publishedState") || {};
const cacheKey = `${service_type}_${instance}_${dbus_path}`;
const alwaysPublishState =
  dbus_path === "/Mode" || dbus_path === "/Ac/ActiveIn/CurrentLimit";

if (
  lastValues[cacheKey] === roundedValue &&
  publishedState[cacheKey] &&
  !alwaysPublishState
) {
  return null; // Block if rounded value hasn't changed
}
lastValues[cacheKey] = roundedValue;
publishedState[cacheKey] = true;
context.set("lastValues", lastValues);
context.set("publishedState", publishedState);

// 3. Build Entity ID (Status Logic)
const safePathRaw = dbus_path
  .replace(/^\//, "")
  .replace(/\//g, "_")
  .toLowerCase();

let safePath = safePathRaw;

// Standardization Rules
if (
  ["charger", "dcdc", "alternator", "solarcharger"].includes(service_type) &&
  safePath.includes("dc_0")
) {
  safePath = safePath.replace("dc_0", "dc_out");
}

// Must stay in sync with the same normalization in victron_create —
// mismatched safePath means state topics no longer match discovery configs.
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
// Must match the same alias in victron_create.
safePath = safePath.replace(/^switchableoutput_(\d+)_state$/, "relay_$1_state");
safePath = safePath
  .replace("_activein", "_in")
  .replace("_active_in", "_in")
  .replace("_active_input", "_in");

// Suffix expansion
if (safePath.endsWith("_p")) safePath = safePath.slice(0, -2) + "_power";
else if (safePath.endsWith("_v")) safePath = safePath.slice(0, -2) + "_voltage";
else if (safePath.endsWith("_i")) safePath = safePath.slice(0, -2) + "_current";
else if (safePath.endsWith("_f"))
  safePath = safePath.slice(0, -2) + "_frequency";

// Total power enforcement
if (safePath.endsWith("_total_p"))
  safePath = safePath.replace(/_total_p$/, "_total_power");
else if (safePath.endsWith("_ac_power"))
  safePath = safePath.replace(/_ac_power$/, "_ac_total_power");
else if (safePath === "ac_power") safePath = "ac_total_power";

// Look up product name
const victronDevices = global.get("victronDevices", "file") || {};
const deviceInfo = victronDevices[`${service_type}_${instance}`];
const deviceName = deviceInfo ? deviceInfo.shortName : service_type;
const entityId = `victron_${deviceName}_${instance}_${safePath}`;

// 4. Determine Component Type & Topic
// Mirrors the component-type ladder in victron_create; a mismatch publishes
// state to a topic no discovery config is listening on. Relay paths are only
// switches where the reference map marks them writable — the VE.Bus relay is
// read-only and stays a sensor.
const switchPaths = [
  "generator:/ManualStart",
  "generator:/AutoStartEnabled",
];
const isEnum = typeof unit === "string" && unit.includes("=");
const enumKeys = isEnum
  ? unit
      .split(";")
      .map((p) => p.split("=")[0].trim())
      .filter((k) => k !== "")
  : [];
const isBinary =
  isEnum && !writable && enumKeys.length === 2 && enumKeys.includes("0");

let componentType = "sensor";
if (dbus_path.endsWith("/CurrentLimit")) {
  componentType = "number";
} else if (isBinary) {
  componentType = "binary_sensor";
} else if (writable && isEnum) {
  componentType =
    switchPaths.includes(`${service_type}:${dbus_path}`) ||
    /\/(Relay|SwitchableOutput)\//.test(dbus_path)
      ? "switch"
      : "select";
} else if (writable && !isEnum) {
  componentType = "number";
}

// 5. Build Final Message
msg.topic = `homeassistant/${componentType}/${entityId}/state`;
msg.payload = { value: roundedValue };

return msg;
