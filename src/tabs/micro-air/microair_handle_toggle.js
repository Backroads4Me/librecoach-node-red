// Handles enable/disable of MicroAir integration via addon config
// Input: msg from librecoach/config/microair_enabled ("true" / "false")
// Output 1 → Filter nodes (reset on enable)
// Output 2 → MQTT Out (entity deletion on disable)

// Only handle microair_enabled messages
const key = msg.topic.split("/").pop();
if (key !== "microair_enabled") return [null, null];

const enabled = msg.payload.toString() === "true";

if (enabled) {
  node.status({ fill: "green", shape: "dot", text: "Enabled" });
  // Reset filter nodes when enabling so stale state doesn't block messages
  return [{ reset: true }, null];
}

// === Disable: delete all tracked entities from HA ===
const discoveryTopics = global.get("microairDiscoveryTopics", "file") || [];

if (discoveryTopics.length === 0) {
  node.status({
    fill: "yellow",
    shape: "ring",
    text: "Disabled (no entities)",
  });
  return [null, null];
}

discoveryTopics.forEach((topic) => {
  node.send([null, { topic: topic, payload: "" }]);
});

// Clear persisted tracking state
global.set("microairDiscoveryTopics", [], "file");
global.set("uniqueMicroair", []);

node.status({
  fill: "red",
  shape: "dot",
  text: `Disabled — removed ${discoveryTopics.length} entities`,
});

return [null, null];
