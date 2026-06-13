// HA Status Publisher for Tank (DGN 1FFB7, §6.28)
// Self-creating: publishes MQTT discovery on first valid reading per instance.
// Output 1: MQTT messages (discovery + state)

if (!msg.payload || typeof msg.payload !== "object") {
  return null;
}

const p = msg.payload;
const instance = p.instance;

if (typeof instance !== "number") {
  return null;
}

const tankType = p.tank_type;
const levelPercentage = p.level_percentage;

if (!tankType || typeof levelPercentage !== "number") {
  return null;
}

// Instance-to-name map (per RV-C spec §6.28)
const tankNameMap = {
  0: "Fresh Water",
  1: "Black Water",
  2: "Gray Water",
  3: "LPG",
  16: "Fresh Water 2",
  17: "Black Water 2",
  18: "Gray Water 2",
  19: "LPG 2",
};

const displayName = tankNameMap[instance] || `Unknown Tank ${instance}`;
const entityId = `tank_${tankType}`;
const componentType = "sensor";
const stateTopic = `homeassistant/${componentType}/${entityId}/state`;

// Clamp level to 0-100%
const level = Math.max(0, Math.min(100, Math.round(levelPercentage)));

const messages = [];

// Self-creating discovery: publish config on first valid reading
const CREATED_KEY = "tankCreated";
const created = flow.get(CREATED_KEY) || {};

if (!created[instance]) {
  messages.push({
    topic: `homeassistant/${componentType}/${entityId}/config`,
    payload: {
      name: displayName,
      unique_id: entityId,
      default_entity_id: `sensor.${entityId}`,
      icon: "mdi:water-percent",
      state_topic: stateTopic,
      unit_of_measurement: "%",
      value_template: "{{ value | float }}",
      availability_mode: "all",
      availability: [
        { topic: "librecoach/nodered/status", payload_available: "online", payload_not_available: "offline" },
        { topic: "can/status", value_template: "{{ 'online' if value == 'online' else 'offline' }}", payload_available: "online", payload_not_available: "offline" },
      ],
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
  payload: level,
});

return [messages];
