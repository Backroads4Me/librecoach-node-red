// Enable/disable Hughes entity processing and remove discovery on disable.

const key = (msg.topic || "").split("/").pop();
if (key !== "hughes_enabled") return null;

const enabled = msg.payload.toString() === "true";
global.set("hughesEnabled", enabled);
if (enabled) {
  node.status({ fill: "green", shape: "dot", text: "Enabled" });
  return null;
}

const topics = global.get("hughesDiscoveryTopics", "file") || [];
for (const topic of topics) node.send({ topic, payload: "" });
global.set("hughesDiscoveryTopics", [], "file");

const keys = global.keys ? global.keys("file") : [];
for (const contextKey of keys) {
  if (contextKey.startsWith("hughes_") && contextKey.endsWith("_discovery_signature")) {
    global.set(contextKey, undefined, "file");
  }
}

node.status({ fill: "red", shape: "dot", text: `Disabled - removed ${topics.length}` });
return null;
