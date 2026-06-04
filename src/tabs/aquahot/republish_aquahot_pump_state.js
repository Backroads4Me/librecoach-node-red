// Republishes AquaHot zone pump states from flow context every 60 seconds.
// This keeps MQTT retain state fresh if Node-RED restarts after the broker.

const messages = [];

const frontState = flow.get("aquahot_pump_front_state");
const floorState = flow.get("aquahot_pump_floor_state");

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
