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

const { service_type, instance, dbus_path, value } = incomingPayload;

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
let componentType = "sensor";
if (dbus_path === "/Ac/ActiveIn/CurrentLimit") componentType = "number";
else if (dbus_path === "/Mode") componentType = "select";
else if (dbus_path.includes("/Relay/")) componentType = "switch";

// 5. Build Final Message
msg.topic = `homeassistant/${componentType}/${entityId}/state`;
msg.payload = { value: roundedValue };

return msg;
