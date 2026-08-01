const victronEnabled = global.get("victronEnabled");
if (!victronEnabled) return null;

// Track per-output metadata for the GX switchable outputs (the GX relays).
// Input: msg.topic = N/{portal}/{service}/{instance}/SwitchableOutput/{output}/Settings/{field}
//
// Output 1 -> MQTT out: removes the switch when an output stops being manual.

// The GX drives the relay itself under every function except Manual, silently
// reverting anything written from outside. Only a manual output gets a switch.
const MANUAL_FUNCTION = 2;

const topic = msg.topic;
if (!topic) return null;

const parts = topic.split("/");
if (parts.length < 8) return null;

const serviceType = parts[2];
const instance = parts[3];
const output = parts[5];
const field = parts[7];
if (field !== "Function" && field !== "CustomName") return null;

let value = null;
try {
  const parsed =
    typeof msg.payload === "string" ? JSON.parse(msg.payload) : msg.payload;
  value = parsed && parsed.value !== undefined ? parsed.value : parsed;
} catch (e) {
  value = msg.payload;
}

const key = `${serviceType}_${instance}_${output}`;
const outputs = global.get("victronOutputs", "file") || {};
const entry = outputs[key] || {};
const previousFunction = entry.func;
const previousCustomName = entry.customName;

if (field === "Function") {
  entry.func = typeof value === "number" ? value : null;
} else {
  entry.customName = typeof value === "string" ? value.trim() : "";
}

outputs[key] = entry;
global.set("victronOutputs", outputs, "file");

node.status({
  fill: "green",
  shape: "dot",
  text: `${Object.keys(outputs).length} outputs`,
});

const functionChanged = field === "Function" && previousFunction !== entry.func;
const nameChanged =
  field === "CustomName" && previousCustomName !== entry.customName;
if (!functionChanged && !nameChanged) return null;

// The entity keeps the legacy /Relay/ id so switches, automations and renames
// survive the move to the SwitchableOutput tree — mirror that here.
const victronDevices = global.get("victronDevices", "file") || {};
const deviceInfo = victronDevices[`${serviceType}_${instance}`];
const deviceName = deviceInfo ? deviceInfo.shortName : serviceType;
const entityId = `victron_${deviceName}_${instance}_relay_${output}_state`;

// Drop the dedup key and cached signature so the next state message re-runs
// discovery with the new function or name.
const uniqueVictron = global.get("uniqueVictron") || [];
const dedupKey = `${serviceType}_${instance}_/SwitchableOutput/${output}/State`;
const remaining = uniqueVictron.filter((k) => k !== dedupKey);
if (remaining.length !== uniqueVictron.length) {
  global.set("uniqueVictron", remaining);
}
global.set(`victron_${entityId}_dsig`, undefined, "file");

// Leaving Manual means the switch can no longer control anything, and no
// further state messages will arrive to retire it — remove it here.
if (previousFunction === MANUAL_FUNCTION && entry.func !== MANUAL_FUNCTION) {
  return { topic: `homeassistant/switch/${entityId}/config`, payload: "" };
}

return null;
