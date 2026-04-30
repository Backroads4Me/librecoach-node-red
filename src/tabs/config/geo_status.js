// HA Status Publisher for Geo Bridge (can/status/geo)
// Self-creating: publishes MQTT discovery on first valid reading.

if (!global.get("geoEnabled")) return null;

if (!msg.payload) {
  return null;
}

// In case the MQTT node isn't set to parse JSON automatically
let p = msg.payload;
if (typeof p === "string") {
  try {
    p = JSON.parse(p);
  } catch (e) {
    node.warn("Failed to parse geo payload as JSON");
    return null;
  }
}

if (p.status !== "online") {
  return null; // Ignore 'unavailable' or 'offline' status messages for now
}

// === Flow context: track which entities have had discovery published ===
const CREATED_KEY = "geoSensorsCreated";
let created = flow.get(CREATED_KEY);

const messages = [];

if (!created) {
  const device = {
    identifiers: ["librecoach-geo"],
    name: "Location",
    manufacturer: "LibreCoach",
  };

  const createSensor = (id, name, icon, unit) => {
    const entityId = `geo_${id}`;
    const payload = {
      name: name,
      unique_id: entityId,
      default_entity_id: `sensor.${entityId}`,
      icon: icon,
      state_topic: `homeassistant/sensor/${entityId}/state`,
      device: device,
    };
    if (unit) payload.unit_of_measurement = unit;

    messages.push({
      topic: `homeassistant/sensor/${entityId}/config`,
      payload: payload,
    });
  };

  createSensor("city", "City", "mdi:city");
  createSensor("state", "State", "mdi:map-marker");
  createSensor("timezone", "Timezone", "mdi:clock-outline");
  createSensor("elevation", "Elevation", "mdi:image-filter-hdr", "m");

  created = true;
  flow.set(CREATED_KEY, created);
}

// Publish states
if (p.city !== undefined)
  messages.push({
    topic: `homeassistant/sensor/geo_city/state`,
    payload: p.city,
  });
if (p.state !== undefined)
  messages.push({
    topic: `homeassistant/sensor/geo_state/state`,
    payload: p.state,
  });
if (p.timezone !== undefined)
  messages.push({
    topic: `homeassistant/sensor/geo_timezone/state`,
    payload: p.timezone,
  });
if (p.elevation !== undefined)
  messages.push({
    topic: `homeassistant/sensor/geo_elevation/state`,
    payload: p.elevation,
  });

return [messages];
