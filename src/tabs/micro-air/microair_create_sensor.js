// Create MicroAir Outdoor Temp sensor

const microairEnabled = global.get("microairEnabled");
if (!microairEnabled) return null;

const payload = msg.payload;
if (!payload || !payload.mac) return null;

const mac = payload.mac;
const safeMac = mac.replace(/:/g, "_");
// Only create outdoor sensor for Zone 0 (or duplicative?)
if (payload.zone !== 0) return null;

const uniqueId = `microair_${safeMac}_outdoor_temp`;
const entityId = uniqueId;

const discoveryTopic = `homeassistant/sensor/${entityId}/config`;
const stateTopic = `librecoach/ble/microair/${mac}/zone/0/state`;

const discoveryPayload = {
  name: `Outdoor Temperature`,
  unique_id: uniqueId,
  default_entity_id: "sensor.temperature_outdoor",
  state_topic: stateTopic,
  value_template:
    "{% if value_json.outdoorTemperature is defined and value_json.outdoorTemperature != 255 %}{{ value_json.outdoorTemperature }}{% else %}None{% endif %}",
  unit_of_measurement: "°F",
  device_class: "temperature",
  icon: "mdi:thermometer",
  device: {
    identifiers: ["librecoach-climate"],
    name: "Climate",
    manufacturer: "LibreCoach",
  },
  availability_topic: `librecoach/ble/microair/${mac}/available`,
};

msg.topic = discoveryTopic;
msg.payload = discoveryPayload;

msg.stateTopic = stateTopic;
msg.entityId = entityId;

return msg;
