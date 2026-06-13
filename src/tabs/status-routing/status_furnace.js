// Publishes standard RV-C furnace entity states to MQTT state topics.
// Outputs an interactive Climate entity along with read-only sensors.

if (!msg.payload || typeof msg.payload !== "object") {
  node.warn("Invalid payload: expected object");
  return null;
}

const p = msg.payload;
const dgn_name = p.dgn_name;
const i = p.instance !== undefined ? p.instance : "";
const i_name = i !== "" ? ` ${i}` : "";
const messages = [];

// === Device definition ===

const device = {
  identifiers: ["librecoach-furnace"],
  name: "Furnace",
  manufacturer: "LibreCoach",
};

// === Flow context: tracks which entities have had discovery published ===

const CREATED_KEY = "furnace_entities_created";
const created = flow.get(CREATED_KEY) || {};

function markCreated(entityId) {
  created[entityId] = true;
  flow.set(CREATED_KEY, created);
}

// === Discovery config builders ===

function climateConfig(entityId, name) {
  const cfg = {
    name,
    unique_id: entityId,
    default_entity_id: `climate.${entityId}`,
    mode_state_topic: `homeassistant/climate/${entityId}/mode/state`,
    mode_command_topic: `homeassistant/climate/${entityId}/mode/set`,
    modes: ["off", "heat"],
    current_temperature_topic: `homeassistant/climate/${entityId}/current_temp/state`,
    temperature_state_topic: `homeassistant/climate/${entityId}/temp/state`,
    temperature_command_topic: `homeassistant/climate/${entityId}/temp/set`,
    temperature_unit: "F",
    action_topic: `homeassistant/climate/${entityId}/action/state`,
    availability_mode: "all",
    availability: [
      { topic: "librecoach/nodered/status", payload_available: "online", payload_not_available: "offline" },
      { topic: "can/status", value_template: "{{ 'online' if value == 'online' else 'offline' }}", payload_available: "online", payload_not_available: "offline" },
    ],
    device,
  };
  return {
    topic: `homeassistant/climate/${entityId}/config`,
    payload: cfg,
  };
}

function sensorConfig(entityId, name, unit, deviceClass, stateClass, icon) {
  const cfg = {
    name,
    unique_id: entityId,
    default_entity_id: `sensor.${entityId}`,
    state_topic: `homeassistant/sensor/${entityId}/state`,
    availability_mode: "all",
    availability: [
      { topic: "librecoach/nodered/status", payload_available: "online", payload_not_available: "offline" },
      { topic: "can/status", value_template: "{{ 'online' if value == 'online' else 'offline' }}", payload_available: "online", payload_not_available: "offline" },
    ],
    device,
  };
  if (unit) cfg.unit_of_measurement = unit;
  if (deviceClass) cfg.device_class = deviceClass;
  if (stateClass) cfg.state_class = stateClass;
  if (icon) cfg.icon = icon;
  return {
    topic: `homeassistant/sensor/${entityId}/config`,
    payload: cfg,
  };
}

function binarySensorConfig(entityId, name, deviceClass, icon) {
  return {
    topic: `homeassistant/binary_sensor/${entityId}/config`,
    payload: {
      name,
      unique_id: entityId,
      default_entity_id: `binary_sensor.${entityId}`,
      state_topic: `homeassistant/binary_sensor/${entityId}/state`,
      payload_on: "ON",
      payload_off: "OFF",
      device_class: deviceClass,
      icon,
      availability_mode: "all",
      availability: [
        { topic: "librecoach/nodered/status", payload_available: "online", payload_not_available: "offline" },
        { topic: "can/status", value_template: "{{ 'online' if value == 'online' else 'offline' }}", payload_available: "online", payload_not_available: "offline" },
      ],
      device,
    },
  };
}

// === Helpers ===

function stateMsg(topic, payload) {
  return { topic, payload };
}

function onOff(value) {
  return value ? "ON" : "OFF";
}

function publishSensor(entityId, stateValue, configFn, canCreate = true) {
  if (!created[entityId]) {
    if (!canCreate) return;
    messages.push(configFn());
    markCreated(entityId);
  }
  messages.push(stateMsg(`homeassistant/sensor/${entityId}/state`, stateValue));
}

function publishBinary(entityId, stateValue, configFn) {
  if (!created[entityId]) {
    messages.push(configFn());
    markCreated(entityId);
  }
  messages.push(
    stateMsg(`homeassistant/binary_sensor/${entityId}/state`, stateValue),
  );
}

function publishClimate(entityId, mode, temp, action, configFn) {
  if (!created[entityId]) {
    messages.push(configFn());
    markCreated(entityId);
  }
  if (mode !== undefined) {
    // Decoder returns "Auto", "Manual", "Off", etc. — map to HA modes.
    const haMode = mode === "Off" || mode === "Not Available" ? "off" : "heat";
    messages.push(
      stateMsg(`homeassistant/climate/${entityId}/mode/state`, haMode),
    );
  }
  if (temp !== undefined && temp !== null) {
    messages.push(
      stateMsg(`homeassistant/climate/${entityId}/temp/state`, temp),
    );
  }
  if (action !== undefined) {
    const haAction = action ? "heating" : "idle";
    messages.push(
      stateMsg(`homeassistant/climate/${entityId}/action/state`, haAction),
    );
  }
}

// === FURNACE_STATUS (1FFE4) ===
if (dgn_name === "FURNACE_STATUS") {
  // Publish Climate Entity State
  if (p.operating_mode !== undefined && p.furnace_active !== undefined) {
    publishClimate(
      `furnace_${i}`,
      p.operating_mode,
      null, // 1FFE4 does not include the setpoint temperature.
      p.furnace_active,
      () => climateConfig(`furnace_${i}`, `Furnace${i_name}`),
    );
  }

  // Publish Read-Only Sensors
  if (
    typeof p.operating_mode === "string" &&
    p.operating_mode !== "Not Available"
  ) {
    publishSensor(`furnace_${i}_mode`, p.operating_mode, () =>
      sensorConfig(
        `furnace_${i}_mode`,
        `Furnace${i_name} Mode`,
        null,
        null,
        null,
        "mdi:radiator",
      ),
    );
  }

  if (typeof p.heat_source === "string" && p.heat_source !== "Not Available") {
    publishSensor(`furnace_${i}_heat_source`, p.heat_source, () =>
      sensorConfig(
        `furnace_${i}_heat_source`,
        `Furnace${i_name} Heat Source`,
        null,
        null,
        null,
        "mdi:fire",
      ),
    );
  }

  if (typeof p.circulation_fan_speed === "number") {
    publishSensor(`furnace_${i}_fan_speed`, p.circulation_fan_speed, () =>
      sensorConfig(
        `furnace_${i}_fan_speed`,
        `Furnace${i_name} Fan Speed`,
        "%",
        null,
        "measurement",
        "mdi:fan",
      ),
    );
  }

  if (typeof p.heat_output_level === "number") {
    publishSensor(`furnace_${i}_heat_level`, p.heat_output_level, () =>
      sensorConfig(
        `furnace_${i}_heat_level`,
        `Furnace${i_name} Heat Level`,
        "%",
        null,
        "measurement",
        "mdi:gauge",
      ),
    );
  }

  if (typeof p.furnace_active === "boolean") {
    publishBinary(`furnace_${i}_active`, onOff(p.furnace_active), () =>
      binarySensorConfig(
        `furnace_${i}_active`,
        `Furnace${i_name} Active`,
        "running",
        "mdi:radiator",
      ),
    );
  }

  if (typeof p.has_fault === "boolean") {
    publishBinary(`furnace_${i}_fault`, onOff(p.has_fault), () =>
      binarySensorConfig(
        `furnace_${i}_fault`,
        `Furnace${i_name} Fault`,
        "problem",
        "mdi:alert-circle",
      ),
    );
  }
}

if (messages.length === 0) {
  return null;
}

return [messages];
