// Record Unknown CAN — Toggle Handler
// Input: MQTT payload "ON" or "OFF" from HA switch
// On start: clears log, sets start time, sets recording flag
// On stop: clears flag, shows message count
// Output: retained state publish back to HA

const cmd = msg.payload;

if (cmd === "1") {
  global.set("recordUnknown", true, "file");
  global.set("recordUnknownStart", Date.now(), "file");
  global.set("recordUnknownLog", [], "file");

  node.status({ fill: "red", shape: "dot", text: "Recording..." });

  return {
    topic: "homeassistant/switch/librecoach_record_unknown/state",
    payload: "1",
    retain: true,
  };
}

if (cmd === "0") {
  global.set("recordUnknown", false, "file");

  const log = global.get("recordUnknownLog", "file") || [];
  node.status({
    fill: "green",
    shape: "dot",
    text: `Stopped — ${log.length} messages`,
  });

  return {
    topic: "homeassistant/switch/librecoach_record_unknown/state",
    payload: "0",
    retain: true,
  };
}

return null;
