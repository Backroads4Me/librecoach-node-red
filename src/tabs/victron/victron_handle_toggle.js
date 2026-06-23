// Handles enable/disable of Victron integration via addon config
// Input: msg from librecoach/config/victron_enabled ("true" / "false")
// Output 1 → Victron out (GX broker connect/disconnect control)
// Output 2 → MQTT Out (entity deletion on disable)
// Output 3 → Filter nodes (reset on enable)

// Only handle victron_enabled messages
const key = msg.topic.split("/").pop();
if (key !== "victron_enabled") return [null, null, null];

const enabled = msg.payload.toString() === "true";

if (enabled) {
  node.status({ fill: "green", shape: "dot", text: "Enabled" });
  // Connect to the GX broker and reset filters.
  return [{ action: "connect" }, null, { reset: true }];
}

// === Disable ===
// Disconnect from the GX broker while disabled.
node.send([{ action: "disconnect" }, null, null]);

const index = global.get("discoveryIndex", "file") || {};
const topics = index.victron || [];

if (topics.length === 0) {
  node.status({
    fill: "yellow",
    shape: "ring",
    text: "Disabled (no entities)",
  });
  return [null, null, null];
}

// Send retained empty payloads to output 2 (MQTT Out) to remove the configs.
topics.forEach((topic) => {
  node.send([null, { topic: topic, payload: "" }, null]);
});

// Clear the ingest unique-filter so re-enable rediscovers cleanly.
global.set("uniqueVictron", []);

// Clear per-entity discovery signatures so re-enable republishes every config.
const keys = global.keys ? global.keys("file") : [];
for (const k of keys) {
  if (k.startsWith("victron_") && k.endsWith("_dsig")) global.set(k, undefined, "file");
}

node.status({
  fill: "red",
  text: `Disabled — removed ${topics.length} entities`,
});

return [null, null, null];