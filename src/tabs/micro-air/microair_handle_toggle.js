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

// === Disable: delete all MicroAir entities ===
const index = global.get("discoveryIndex", "file") || {};
const topics = index.microair || [];

if (topics.length === 0) {
  node.status({
    fill: "yellow",
    shape: "ring",
    text: "Disabled (no entities)",
  });
  return [null, null];
}

// Send retained empty payloads to output 2 (MQTT Out) to remove the configs.
topics.forEach((topic) => {
  node.send([null, { topic: topic, payload: "" }]);
});

// Clear the ingest unique-filter so re-enable rediscovers cleanly.
global.set("uniqueMicroair", []);

node.status({
  fill: "red",
  shape: "dot",
  text: `Disabled — removed ${topics.length} entities`,
});

return [null, null];
