// Handles enable/disable of Geo integration via addon config
// Input: msg from librecoach/config/geo_enabled ("true" / "false")
// Output 1 → MQTT Out (entity deletion on disable)

// Only handle geo_enabled messages
const key = msg.topic.split("/").pop();
if (key !== "geo_enabled") return null;

const enabled = msg.payload.toString() === "true";

if (enabled) {
  node.status({ fill: "green", shape: "dot", text: "Enabled" });
  return null;
}

// === Disable: delete all tracked entities from HA ===
// Only need to delete what we create in status_geo.js
const sensors = ["city", "state", "timezone", "elevation"];

let deletedCount = 0;
sensors.forEach((sensor) => {
  const entityId = `geo_${sensor}`;
  node.send({ topic: `homeassistant/sensor/${entityId}/config`, payload: "" });
  deletedCount++;
});

// Clear persisted tracking state
flow.set("geoSensorsCreated", false);

node.status({
  fill: "red",
  text: `Disabled — removed ${deletedCount} entities`,
});

return null;
