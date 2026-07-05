// Republishes AquaHot zone pump states from global file context every 60 seconds.
// This keeps MQTT retain state fresh if Node-RED restarts after the broker.
// Global (not flow) context is required: the states are written by
// status_waterheater.js on the Status routing tab, and flow context does
// not cross tabs.

const messages = [];

const frontState = global.get("aquahot_pump_front_state", "file");
const floorState = global.get("aquahot_pump_floor_state", "file");

if (frontState !== null && frontState !== undefined) {
  messages.push({
    topic: "homeassistant/binary_sensor/aquahot_front_pump/state",
    payload: frontState,
  });
}

if (floorState !== null && floorState !== undefined) {
  messages.push({
    topic: "homeassistant/binary_sensor/aquahot_floor_pump/state",
    payload: floorState,
  });
}

if (messages.length === 0) return null;

return [messages];
