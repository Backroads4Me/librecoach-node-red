// HA Status Publisher for THERMOSTAT_AMBIENT_STATUS (1FF9C)
// Self-creating: publishes MQTT discovery on first valid reading per zone instance.

if (!msg.payload || typeof msg.payload !== "object") {
  node.warn("Invalid payload: expected object");
  return null;
}

const p = msg.payload;
const instance = p.instance;
const temperature = p.ambient_temperature;

if (typeof instance !== "number") {
  node.warn("Missing 'instance'");
  return null;
}

if (temperature === null || temperature === "Out of Range") {
  return null;
}

if (typeof temperature !== "number") {
  return null;
}

// === Deadband filter: suppress updates smaller than 0.5°F ===

const LAST_TEMP_KEY = "thermostatAmbientLastTemp";
const lastTemp = flow.get(LAST_TEMP_KEY) || {};
const DEADBAND = 0.2;

if (
  lastTemp[instance] !== undefined &&
  Math.abs(temperature - lastTemp[instance]) < DEADBAND
) {
  return null;
}
lastTemp[instance] = temperature;
flow.set(LAST_TEMP_KEY, lastTemp);

// === Entity identifiers ===

const entityId = `thermostat_ambient_zone${instance}`;
const stateTopic = `homeassistant/sensor/${entityId}/state`;

// === Flow context: track which zones have had discovery published ===

const CREATED_KEY = "thermostatAmbientCreated";
const created = flow.get(CREATED_KEY) || {};

const messages = [];

if (!created[instance]) {
  messages.push({
    topic: `homeassistant/sensor/${entityId}/config`,
    payload: {
      name: `Zone ${instance + 1} Ambient Temperature`,
      unique_id: entityId,
      default_entity_id: `sensor.${entityId}`,
      icon: "mdi:thermometer",
      state_topic: stateTopic,
      device_class: "temperature",
      state_class: "measurement",
      unit_of_measurement: "°F",
      availability_mode: "all",
      availability: [
        { topic: "librecoach/nodered/status", payload_available: "online", payload_not_available: "offline" },
        { topic: "can/status", value_template: "{{ 'online' if value == 'online' else 'offline' }}", payload_available: "online", payload_not_available: "offline" },
      ],
      device: {
        identifiers: ["librecoach-climate"],
        name: "Climate",
        manufacturer: "LibreCoach",
      },
    },
  });
  created[instance] = true;
  flow.set(CREATED_KEY, created);
}

messages.push({ topic: stateTopic, payload: temperature });

return [messages];
