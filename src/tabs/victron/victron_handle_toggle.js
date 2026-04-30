// Handles enable/disable of Victron integration via addon config
// Input: msg from librecoach/config/victron_enabled ("true" / "false")
// Output 1 → MQTT Out (entity deletion on disable)
// Output 2 → Filter nodes (reset on enable)

// Only handle victron_enabled messages
const key = msg.topic.split("/").pop();
if (key !== "victron_enabled") return [null, null];

const enabled = msg.payload.toString() === "true";

if (enabled) {
  node.status({ fill: "green", shape: "dot", text: "Enabled" });
  // Reset filter nodes when enabling so stale state doesn't block messages
  return [null, { reset: true }];
}

// === Disable: delete all tracked entities from HA ===
const discoveryTopics = global.get("victronDiscoveryTopics", "file") || [];

if (discoveryTopics.length === 0) {
  node.status({
    fill: "yellow",
    shape: "ring",
    text: "Disabled (no entities)",
  });
  return [null, null];
}

// Send deletion messages to output 1 (MQTT Out)
discoveryTopics.forEach((topic) => {
  node.send([{ topic: topic, payload: "" }, null]);
});

// Clear persisted tracking state
global.set("uniqueVictron", []);

node.status({
  fill: "red",
  text: `Disabled — removed ${discoveryTopics.length} entities`,
});

return [null, null];
