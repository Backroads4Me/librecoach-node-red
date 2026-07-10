// Aqua-Hot 400/600-Series systems
// HA Status Publisher for AquaHot (AQUAHOT_STATUS_1, EF9F)
// Self-creating: publishes MQTT discovery on first valid reading per instance.
// Output 1: MQTT messages (discovery + state)

if (
  !msg.payload ||
  typeof msg.payload.instance !== "string" ||
  typeof msg.payload.status !== "string"
) {
  return null;
}

const instance = msg.payload.instance;
const status = msg.payload.status;

if (status === "Not Available" || status === "Reserved" || status === "Error") {
  return null;
}

// Validate instance is one of the expected values
const instanceConfig = {
  burner: { name: "Diesel Burner", icon: "mdi:fire" },
  ac_1: { name: "AC Element 1", icon: "mdi:lightning-bolt" },
  ac_2: { name: "AC Element 2", icon: "mdi:lightning-bolt" },
  engine: { name: "Engine Pre-heat", icon: "mdi:engine" },
};

const config = instanceConfig[instance];
if (!config) {
  return null;
}

const haStatus = status.toUpperCase();
const entityId = `aquahot_${instance}`;
const componentType = "light";
const stateTopic = `homeassistant/${componentType}/${entityId}/state`;

const messages = [];

// Self-creating discovery: publish config on first valid reading
const CREATED_KEY = "aquahotCreated";
const created = flow.get(CREATED_KEY) || {};

if (!created[instance]) {
  messages.push({
    topic: `homeassistant/${componentType}/${entityId}/config`,
    payload: {
      name: config.name,
      unique_id: entityId,
      default_entity_id: `${componentType}.${entityId}`,
      icon: config.icon,
      command_topic: `homeassistant/${componentType}/${entityId}/set`,
      state_topic: stateTopic,
      payload_on: "ON",
      payload_off: "OFF",
      availability_mode: "all",
      availability: [
        { topic: "librecoach/nodered/status", payload_available: "online", payload_not_available: "offline" },
        { topic: "can/status", value_template: "{{ 'online' if value == 'online' else 'offline' }}", payload_available: "online", payload_not_available: "offline" },
      ],
      device: {
        identifiers: ["librecoach-aquahot"],
        name: "Aqua-Hot",
        manufacturer: "LibreCoach",
      },
    },
  });

  created[instance] = true;
  flow.set(CREATED_KEY, created);
}

// State update
messages.push({
  topic: stateTopic,
  payload: haStatus,
});

return [messages];
