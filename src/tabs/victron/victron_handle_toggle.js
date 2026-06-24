// Reconciles the Victron GX broker connection to the desired enabled state.
//
// Output 1 -> Victron out  (GX broker connect/disconnect control)
// Output 2 -> MQTT Out      (entity deletion on disable)
// Output 3 -> Filter nodes  (reset on enable)

const enabled = global.get("victronEnabled") === true;
const wasEnabled = context.get("reconciledEnabled");

if (enabled) {
  node.status({ fill: "green", shape: "dot", text: "Enabled" });
  // Reset the ingest filters only on a real disabled -> enabled transition.
  const resetMsg = wasEnabled === true ? null : { reset: true };
  context.set("reconciledEnabled", true);
  // connect is idempotent: node-red ignores it when already connected/connecting.
  return [{ action: "connect" }, null, resetMsg];
}

// === Disabled ===
context.set("reconciledEnabled", false);

// Disconnect only on a real enabled -> disabled transition.
if (wasEnabled === true) {
  node.send([{ action: "disconnect" }, null, null]);
}

// Remove any HA entities still advertised for Victron.
const index = global.get("discoveryIndex", "file") || {};
const topics = index.victron || [];

if (topics.length === 0) {
  node.status({ fill: "yellow", shape: "ring", text: "Disabled" });
  return [null, null, null];
}

// Send retained empty payloads to output 2 (MQTT Out) to remove the configs.
topics.forEach((topic) => {
  node.send([null, { topic: topic, payload: "" }, null]);
});

// Clear discovery state so a future enable rediscovers and republishes cleanly.
global.set("uniqueVictron", []);
const keys = global.keys ? global.keys("file") : [];
for (const k of keys) {
  if (k.startsWith("victron_") && k.endsWith("_dsig"))
    global.set(k, undefined, "file");
}

node.status({
  fill: "red",
  text: `Disabled — removed ${topics.length} entities`,
});

return [null, null, null];
