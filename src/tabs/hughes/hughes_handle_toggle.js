// Handles enable/disable of Hughes integration via addon config
// Input: msg from librecoach/config/hughes_enabled ("true" / "false")
// Output → MQTT Out (entity deletion on disable)

// Only handle hughes_enabled messages
const key = (msg.topic || "").split("/").pop();
if (key !== "hughes_enabled") return null;

const enabled = msg.payload.toString() === "true";
global.set("hughesEnabled", enabled);

if (enabled) {
  node.status({ fill: "green", shape: "dot", text: "Enabled" });
  return null;
}

// === Disable: delete all Hughes entities ===
const index = global.get("discoveryIndex", "file") || {};
const topics = index.hughes || [];

if (topics.length === 0) {
  node.status({ fill: "yellow", shape: "ring", text: "Disabled (no entities)" });
  return null;
}

// Send retained empty payloads to remove the configs.
for (const topic of topics) node.send({ topic, payload: "" });

// Clear the per-entity discovery signatures so re-enable republishes cleanly.
const keys = global.keys ? global.keys("file") : [];
for (const contextKey of keys) {
  if (contextKey.startsWith("hughes_") && contextKey.endsWith("_discovery_signature")) {
    global.set(contextKey, undefined, "file");
  }
}

node.status({ fill: "red", shape: "dot", text: `Disabled - removed ${topics.length}` });
return null;
