// Create/update Home Assistant MQTT Discovery entities from Hughes BLE state.
// Input: librecoach/ble/hughes/{mac}/state
// Output: discovery messages for retained MQTT output.

if (!global.get("hughesEnabled")) return null;

const parts = (msg.topic || "").split("/");
if (parts.length !== 5 || parts[0] !== "librecoach" || parts[2] !== "hughes") {
  return null;
}

let state = msg.payload;
if (typeof state === "string") {
  try {
    state = JSON.parse(state);
  } catch (error) {
    node.warn(`Invalid Hughes state JSON: ${error.message}`);
    return null;
  }
}
if (!state || typeof state !== "object" || !state.protocol) return null;

const mac = parts[3].toLowerCase();
const safeMac = mac.replace(/:/g, "_");
const baseId = `hughes_${safeMac}`;
const stateTopic = `librecoach/ble/hughes/${mac}/state`;
const availabilityTopic = `librecoach/ble/hughes/${mac}/available`;
const device = {
  identifiers: [baseId],
  name: `Hughes Power Watchdog ${mac}`,
  manufacturer: "Hughes Autoformers",
  model: `${state.protocol}${state.is_50a ? " 50A" : " 30A"}`,
};
const availability = [
  { topic: "librecoach/nodered/status", payload_available: "online", payload_not_available: "offline" },
  { topic: availabilityTopic, payload_available: "online", payload_not_available: "offline" },
];

global.set(`${baseId}_state`, state, "file");

const signature = JSON.stringify({
  protocol: state.protocol,
  is_50a: Boolean(state.is_50a),
  supports_control: Boolean(state.supports_control),
  has_booster: Boolean(state.has_booster),
});
if (global.get(`${baseId}_discovery_signature`, "file") === signature) return null;
global.set(`${baseId}_discovery_signature`, signature, "file");

const messages = [];
const tracked = global.get("hughesDiscoveryTopics", "file") || [];

function add(component, suffix, payload) {
  const entityId = `${baseId}_${suffix}`;
  const topic = `homeassistant/${component}/${entityId}/config`;
  payload.unique_id = entityId;
  payload.default_entity_id = `${component}.${entityId}`;
  payload.device = device;
  if (!payload.availability && !payload.availability_topic) {
    payload.availability_mode = "all";
    payload.availability = availability;
  }
  messages.push({ topic, payload });
  if (!tracked.includes(topic)) tracked.push(topic);
}

function sensor(suffix, name, field, unit, deviceClass, stateClass, icon) {
  const payload = {
    name,
    state_topic: stateTopic,
    value_template: `{{ value_json.${field} if value_json.${field} is not none else 'unknown' }}`,
  };
  if (unit) payload.unit_of_measurement = unit;
  if (deviceClass) payload.device_class = deviceClass;
  if (stateClass) payload.state_class = stateClass;
  if (icon) payload.icon = icon;
  add("sensor", suffix, payload);
}

sensor("voltage_l1", "Shore Voltage L1", "voltage_l1", "V", "voltage", "measurement");
sensor("current_l1", "Shore Current L1", "current_l1", "A", "current", "measurement");
sensor("power_l1", "Shore Power L1", "power_l1", "W", "power", "measurement");
sensor("frequency_l1", "Shore Frequency L1", "frequency_l1", "Hz", "frequency", "measurement");
sensor("energy", "Cumulative Energy", "energy_kwh", "kWh", "energy", "total_increasing");
sensor("combined_power", "Combined Shore Power", "combined_power", "W", "power", "measurement");
sensor("error_code", "Error Code", "error_code", null, null, null, "mdi:alert-circle-outline");
sensor("error_description", "Error Description", "error_description", null, null, null, "mdi:text-box-alert-outline");

if (state.is_50a) {
  sensor("voltage_l2", "Shore Voltage L2", "voltage_l2", "V", "voltage", "measurement");
  sensor("current_l2", "Shore Current L2", "current_l2", "A", "current", "measurement");
  sensor("power_l2", "Shore Power L2", "power_l2", "W", "power", "measurement");
  sensor("frequency_l2", "Shore Frequency L2", "frequency_l2", "Hz", "frequency", "measurement");
}

if (state.supports_control) {
  add("binary_sensor", "relay_status", {
    name: "Relay Status",
    state_topic: stateTopic,
    value_template: "{{ 'ON' if value_json.relay_status == 0 else 'OFF' }}",
    payload_on: "ON",
    payload_off: "OFF",
    device_class: "power",
  });
  add("binary_sensor", "neutral_detection_status", {
    name: "Neutral Detection Status",
    state_topic: stateTopic,
    value_template: "{{ 'OFF' if value_json.neutral_detection == 0 else 'ON' }}",
    payload_on: "ON",
    payload_off: "OFF",
    device_class: "problem",
  });
  add("switch", "relay", {
    name: "Shore Power Relay",
    state_topic: stateTopic,
    value_template: "{{ 'ON' if value_json.relay_status == 0 else 'OFF' }}",
    command_topic: `homeassistant/switch/${baseId}_relay/set`,
    payload_on: "ON",
    payload_off: "OFF",
    icon: "mdi:power-plug",
  });
  add("switch", "neutral_detection", {
    name: "Neutral Detection",
    state_topic: stateTopic,
    value_template: "{{ 'ON' if value_json.neutral_detection == 0 else 'OFF' }}",
    command_topic: `homeassistant/switch/${baseId}_neutral_detection/set`,
    payload_on: "ON",
    payload_off: "OFF",
    icon: "mdi:shield-check",
  });
  add("button", "reset_energy", {
    name: "Reset Energy Counter",
    command_topic: `homeassistant/button/${baseId}_reset_energy/set`,
    payload_press: "PRESS",
    icon: "mdi:counter",
    entity_category: "config",
  });
}

if (state.has_booster) {
  sensor("output_voltage", "Output Voltage", "output_voltage", "V", "voltage", "measurement");
  sensor("temperature", "Device Temperature", "temperature", "°C", "temperature", "measurement");
  add("binary_sensor", "boost_active", {
    name: "Boost Active",
    state_topic: stateTopic,
    value_template: "{{ 'ON' if value_json.boost_mode == 1 else 'OFF' }}",
    payload_on: "ON",
    payload_off: "OFF",
    icon: "mdi:lightning-bolt",
  });
}

add("binary_sensor", "ble_availability", {
  name: "BLE Availability",
  state_topic: availabilityTopic,
  payload_on: "online",
  payload_off: "offline",
  device_class: "connectivity",
  entity_category: "diagnostic",
  availability_topic: "librecoach/nodered/status",
});
add("sensor", "ble_last_success", {
  name: "BLE Last Success",
  state_topic: `librecoach/ble/hughes/${mac}/last_success`,
  device_class: "timestamp",
  entity_category: "diagnostic",
});
add("sensor", "ble_failure_count", {
  name: "BLE Failure Count",
  state_topic: `librecoach/ble/hughes/${mac}/failure_count`,
  state_class: "measurement",
  entity_category: "diagnostic",
});
add("sensor", "ble_last_error", {
  name: "BLE Last Error",
  state_topic: `librecoach/ble/hughes/${mac}/last_error`,
  entity_category: "diagnostic",
});
add("button", "ble_reconnect", {
  name: "BLE Reconnect",
  command_topic: `librecoach/ble/hughes/${mac}/reconnect`,
  icon: "mdi:bluetooth-connect",
  entity_category: "config",
  availability_topic: "librecoach/nodered/status",
});
add("button", "ble_clear_errors", {
  name: "BLE Clear Errors",
  command_topic: `librecoach/ble/hughes/${mac}/clear_errors`,
  icon: "mdi:alert-circle-check",
  entity_category: "config",
  availability_topic: "librecoach/nodered/status",
});

global.set("hughesDiscoveryTopics", tracked, "file");
node.status({ fill: "green", shape: "dot", text: `${state.protocol} ${state.is_50a ? "50A" : "30A"}` });
return [messages];
