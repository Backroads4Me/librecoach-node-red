// HA Status Publisher for Water Pump
// Self-creating: publishes MQTT discovery on first valid reading.
// Output 1: MQTT messages (discovery + state)

if (
  !msg.payload ||
  typeof msg.payload.instance !== "string" ||
  typeof msg.payload.status !== "string"
) {
  return null;
}

const instance = msg.payload.instance;
const haStatus = msg.payload.status.toUpperCase(); // "ON" or "OFF"
const entityId = instance;
const componentType = "switch";
const stateTopic = `homeassistant/${componentType}/${entityId}/state`;

const messages = [];

// Self-creating discovery: publish config on first valid reading
const CREATED_KEY = "waterPumpCreated";
const created = flow.get(CREATED_KEY) || {};

if (!created[instance]) {
  messages.push({
    topic: `homeassistant/${componentType}/${entityId}/config`,
    payload: {
      name: "Water Pump",
      unique_id: entityId,
      default_entity_id: `${componentType}.${entityId}`,
      icon: "mdi:water-pump",
      command_topic: `homeassistant/${componentType}/${entityId}/set`,
      state_topic: stateTopic,
      payload_on: "ON",
      payload_off: "OFF",
      device: {
        identifiers: ["librecoach-water"],
        name: "Water",
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
