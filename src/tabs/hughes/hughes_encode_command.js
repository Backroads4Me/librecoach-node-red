// Convert Home Assistant Hughes commands to the add-on MQTT command contract.
// Output 1: bridge command. Output 2: optimistic state update.

if (!global.get("hughesEnabled")) return null;

const parts = (msg.topic || "").split("/");
if (parts.length !== 4 || parts[0] !== "homeassistant" || parts[3] !== "set") return null;

const component = parts[1];
const entityId = parts[2];
if (!entityId.startsWith("hughes_")) return null;

let suffix;
if (component === "switch" && entityId.endsWith("_neutral_detection")) {
  suffix = "neutral_detection";
} else if (component === "switch" && entityId.endsWith("_relay")) {
  suffix = "relay";
} else if (component === "button" && entityId.endsWith("_reset_energy")) {
  suffix = "reset_energy";
} else {
  return null;
}

const baseId = entityId.slice(0, -(suffix.length + 1));
const safeMac = baseId.slice("hughes_".length);
const mac = safeMac.replace(/_/g, ":");
const bridgeTopic = `librecoach/ble/hughes/${mac}/set`;

let command;
if (suffix === "reset_energy") {
  command = { command: "reset_energy" };
} else {
  const enabled = msg.payload.toString().toUpperCase() === "ON";
  command = { command: suffix, value: enabled };
}

const bridgeMsg = { topic: bridgeTopic, payload: JSON.stringify(command) };
if (suffix === "reset_energy") return [bridgeMsg, null];

const stateKey = `${baseId}_state`;
const optimistic = { ...(global.get(stateKey, "file") || {}) };
if (!optimistic.protocol) return [bridgeMsg, null];
if (suffix === "relay") optimistic.relay_status = command.value ? 0 : 1;
if (suffix === "neutral_detection") optimistic.neutral_detection = command.value ? 0 : 1;
global.set(stateKey, optimistic, "file");

return [
  bridgeMsg,
  { topic: `librecoach/ble/hughes/${mac}/state`, payload: JSON.stringify(optimistic) },
];
