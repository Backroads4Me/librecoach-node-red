// Encodes HA commands to Victron MQTT format

const VEBUS_MODE_MAP = {
  "charger only": 1,
  "inverter only": 2,
  on: 3,
  off: 4,
};

const topic = msg.topic;
if (!topic) {
  node.error("Missing msg.topic");
  return null;
}

const prefix = "librecoach/victron/set/";
if (!topic.startsWith(prefix)) {
  node.warn(`Unexpected command topic: ${topic}`);
  return null;
}

// Extract path components: "system/0/Relay/1/State"
const pathPart = topic.substring(prefix.length);
const parts = pathPart.split("/");
if (parts.length < 3) {
  node.error(`Invalid command topic structure: ${topic}`);
  return null;
}

const serviceType = parts[0];
const instance = parts[1];
const dbusPath = "/" + parts.slice(2).join("/");

let value = msg.payload;

// Convert string payloads to numbers if applicable
if (typeof value === "string") {
  const num = Number(value);
  if (!isNaN(num)) {
    value = num;
  } else if (serviceType === "vebus" && dbusPath === "/Mode") {
    const mapped = VEBUS_MODE_MAP[value.toLowerCase()];
    if (mapped !== undefined) {
      value = mapped;
    } else {
      node.warn(`Unknown VE.Bus mode value: ${value}`);
      return null;
    }
  }
}

// Gate: Ensure active Portal ID
const victronPortalId = global.get("victronPortalId", "file");
if (!victronPortalId) {
  node.warn("Cannot send Victron command: victronPortalId not set");
  return null;
}

// --- Output 1: Victron Write ---
const victronMsg = {
  topic: `W/${victronPortalId}/${serviceType}/${instance}${dbusPath}`,
  payload: JSON.stringify({ value: value }),
};

// --- Output 2: HA System Relay Status Feedback ---
let haStatusMsg = null;

// Filter: Only proceed if it is a "system" service AND contains "relay"
const isSystemRelay =
  serviceType === "system" && dbusPath.toLowerCase().includes("relay");

if (isSystemRelay) {
  const sanitizedPath = parts
    .slice(2)
    .map((p) => p.toLowerCase())
    .join("_");

  haStatusMsg = {
    topic: `homeassistant/switch/victron_${serviceType}_${instance}_${sanitizedPath}/state`,
    payload: { value: value },
  };
}

// Return array: [Victron, HA Status (if system relay)]
return [victronMsg, haStatusMsg];
