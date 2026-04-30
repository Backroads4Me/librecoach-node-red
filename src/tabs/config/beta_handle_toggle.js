// Handles enable/disable of Beta features and tracks beta entities for automatic deletion.
// Input can be both config trigger and MQTT discovery configs.
// Output 1 → MQTT Out (entity creation configs or entity deletion payloads)
// Output 2 → Filter nodes (reset on enable)

// 1. Handle config enable/disable messages
const key = msg.topic.split("/").pop();
if (key === "beta_enabled") {
  const enabled = msg.payload.toString() === "true";

  if (enabled) {
    node.status({ fill: "green", shape: "dot", text: "Enabled" });
    // Output 2 reset for filter nodes
    return [null, { reset: true }];
  }

  // === Disable: delete all tracked beta entities from HA ===
  const discoveryTopics = global.get("betaDiscoveryTopics", "file") || [];

  if (discoveryTopics.length === 0) {
    node.status({
      fill: "yellow",
      shape: "ring",
      text: "Disabled (no entities)",
    });
    return [null, null];
  }

  // Send deletion messages to output 1 (MQTT Out)
  const msgs = discoveryTopics.map((topic) => ({ topic: topic, payload: "" }));

  // Clear persisted tracking state
  global.set("betaDiscoveryTopics", [], "file");

  node.status({
    fill: "red",
    text: `Disabled — removed ${discoveryTopics.length} entities`,
  });

  return [msgs, null];
}

// 2. Handle incoming discovery config messages (from beta Create nodes)
if (
  msg.topic &&
  msg.topic.startsWith("homeassistant/") &&
  msg.topic.endsWith("/config")
) {
  const isBetaEnabled = global.get("betaEnabled");

  // Only process if beta is actually enabled
  if (isBetaEnabled === true) {
    let discoveryTopics = global.get("betaDiscoveryTopics", "file") || [];

    // Add to tracked list if not already there
    if (!discoveryTopics.includes(msg.topic)) {
      discoveryTopics.push(msg.topic);
      global.set("betaDiscoveryTopics", discoveryTopics, "file");
      node.status({
        fill: "green",
        shape: "dot",
        text: `Tracking ${discoveryTopics.length} entities`,
      });
    }

    // Pass the message through to Output 1 (MQTT Out) to actually create the entity
    return [msg, null];
  } else {
    // If a create message arrives while beta is disabled, block it.
    return [null, null];
  }
}

// Ignore unknown messages
return [null, null];