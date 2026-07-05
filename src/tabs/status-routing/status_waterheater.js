// Publishes water heater and circulation pump entity states to MQTT state topics.
// Also publishes MQTT discovery configs the first time a valid value is received.

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
  identifiers: ["librecoach-waterheater"],
  name: "Water Heater",
  manufacturer: "LibreCoach",
};

const aquahotDevice = {
  identifiers: ["librecoach-aquahot"],
  name: "Aqua-Hot",
  manufacturer: "LibreCoach",
};

// === Flow context: tracks which entities have had discovery published ===

const CREATED_KEY = "waterheater_entities_created";
const created = flow.get(CREATED_KEY) || {};

function markCreated(entityId) {
  created[entityId] = true;
  flow.set(CREATED_KEY, created);
}

// === Discovery config builders ===

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

function switchConfig(entityId, name, icon, commandTopic) {
  return {
    topic: `homeassistant/switch/${entityId}/config`,
    payload: {
      name,
      unique_id: entityId,
      default_entity_id: `switch.${entityId}`,
      state_topic: `homeassistant/switch/${entityId}/state`,
      command_topic: commandTopic,
      payload_on: "ON",
      payload_off: "OFF",
      icon,
      device: aquahotDevice,
    },
  };
}

function publishSwitch(entityId, stateValue, configFn) {
  if (!created[entityId]) {
    messages.push(configFn());
    markCreated(entityId);
  }
  messages.push(stateMsg(`homeassistant/switch/${entityId}/state`, stateValue));
}

function aquahotBinarySensorConfig(entityId, name, deviceClass, icon) {
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
      device: aquahotDevice,
    },
  };
}

// === WATERHEATER_STATUS (1FFF7) ===
if (dgn_name === "WATERHEATER_STATUS") {
  if (
    typeof p.operating_mode === "string" &&
    p.operating_mode !== "Not Available"
  ) {
    publishSensor(`waterheater_${i}_mode`, p.operating_mode, () =>
      sensorConfig(
        `waterheater_${i}_mode`,
        `Mode${i_name}`,
        null,
        null,
        null,
        "mdi:water-boiler",
      ),
    );
  }

  if (typeof p.water_temperature === "number") {
    publishSensor(`waterheater_${i}_water_temp`, p.water_temperature, () =>
      sensorConfig(
        `waterheater_${i}_water_temp`,
        `Water Temp${i_name}`,
        "°F",
        "temperature",
        "measurement",
        "mdi:thermometer",
      ),
    );
  }

  if (typeof p.setpoint_temperature === "number") {
    publishSensor(`waterheater_${i}_setpoint`, p.setpoint_temperature, () =>
      sensorConfig(
        `waterheater_${i}_setpoint`,
        `Setpoint${i_name}`,
        "°F",
        "temperature",
        "measurement",
        "mdi:thermometer-check",
      ),
    );
  }

  if (typeof p.burner_active === "boolean") {
    publishBinary(`waterheater_${i}_burner`, onOff(p.burner_active), () =>
      binarySensorConfig(
        `waterheater_${i}_burner`,
        `Burner${i_name}`,
        "running",
        "mdi:fire",
      ),
    );
  }

  if (typeof p.ac_element_active === "boolean") {
    publishBinary(
      `waterheater_${i}_ac_element`,
      onOff(p.ac_element_active),
      () =>
        binarySensorConfig(
          `waterheater_${i}_ac_element`,
          `AC Element${i_name}`,
          "running",
          "mdi:lightning-bolt",
        ),
    );
  }

  if (typeof p.thermostat_not_met === "boolean") {
    publishBinary(
      `waterheater_${i}_thermostat`,
      onOff(p.thermostat_not_met),
      () =>
        binarySensorConfig(
          `waterheater_${i}_thermostat`,
          `Thermostat${i_name}`,
          null,
          "mdi:thermostat",
        ),
    );
  }

  if (typeof p.high_temp_tripped === "boolean") {
    publishBinary(
      `waterheater_${i}_high_temp`,
      onOff(p.high_temp_tripped),
      () =>
        binarySensorConfig(
          `waterheater_${i}_high_temp`,
          `High Temp${i_name}`,
          "problem",
          "mdi:thermometer-alert",
        ),
    );
  }

  if (typeof p.ignite_failed === "boolean") {
    publishBinary(`waterheater_${i}_ignite_fail`, onOff(p.ignite_failed), () =>
      binarySensorConfig(
        `waterheater_${i}_ignite_fail`,
        `Ignite Fail${i_name}`,
        "problem",
        "mdi:fire-alert",
      ),
    );
  }

  // AquaHot 125D — diesel burner switch (controlled via 1FE98 toggle)
  // Physical state is cached in global file context so
  // encode_waterheater_command_2 (HA commands tab) can compare desired vs.
  // actual state before toggling — 1FE98 is a toggle, not a set/clear, so
  // toggling blind can reverse a command that raced with the physical panel.
  if (typeof p.burner_active === "boolean") {
    global.set("aquahot_burner_active", p.burner_active, "file");
    publishSwitch("aquahot_diesel_burner", onOff(p.burner_active), () =>
      switchConfig(
        "aquahot_diesel_burner",
        "Diesel Burner",
        "mdi:fire",
        "homeassistant/switch/aquahot_diesel_burner/set",
      ),
    );
  }

  // AquaHot 125D — electric element switch (controlled via 1FE98 toggle)
  if (typeof p.ac_element_active === "boolean") {
    global.set("aquahot_electric_active", p.ac_element_active, "file");
    publishSwitch("aquahot_electric_element", onOff(p.ac_element_active), () =>
      switchConfig(
        "aquahot_electric_element",
        "Electric Element",
        "mdi:lightning-bolt",
        "homeassistant/switch/aquahot_electric_element/set",
      ),
    );
  }
}

// === WATERHEATER_STATUS_2 (1FE99) ===
else if (dgn_name === "WATERHEATER_STATUS_2") {
  if (typeof p.status === "string" && p.status !== "Not Available") {
    publishSensor(`waterheater_${i}_status`, p.status, () =>
      sensorConfig(
        `waterheater_${i}_status`,
        `Status${i_name}`,
        null,
        null,
        null,
        "mdi:water-boiler",
      ),
    );
  }

  if (typeof p.electric_element_level === "number") {
    publishSensor(
      `waterheater_${i}_element_level`,
      p.electric_element_level,
      () =>
        sensorConfig(
          `waterheater_${i}_element_level`,
          `Element Level${i_name}`,
          null,
          null,
          "measurement",
          "mdi:gauge",
        ),
    );
  }

  if (p.hot_water_priority !== undefined && p.hot_water_priority !== null) {
    publishSensor(`waterheater_${i}_priority`, p.hot_water_priority, () =>
      sensorConfig(
        `waterheater_${i}_priority`,
        `Priority${i_name}`,
        null,
        null,
        null,
        "mdi:arrow-decision",
      ),
    );
  }

  if (typeof p.engine_preheat_active === "boolean") {
    publishBinary(
      `waterheater_${i}_preheat`,
      onOff(p.engine_preheat_active),
      () =>
        binarySensorConfig(
          `waterheater_${i}_preheat`,
          `Preheat${i_name}`,
          "running",
          "mdi:engine",
        ),
    );
  }

  if (typeof p.coolant_low === "boolean") {
    publishBinary(`waterheater_${i}_coolant_low`, onOff(p.coolant_low), () =>
      binarySensorConfig(
        `waterheater_${i}_coolant_low`,
        `Coolant Low${i_name}`,
        "problem",
        "mdi:coolant-temperature",
      ),
    );
  }

  if (typeof p.has_fault === "boolean") {
    publishBinary(`waterheater_${i}_fault`, onOff(p.has_fault), () =>
      binarySensorConfig(
        `waterheater_${i}_fault`,
        `Fault${i_name}`,
        "problem",
        "mdi:alert-circle",
      ),
    );
  }
}

// === CIRCULATION_PUMP_STATUS ===
else if (dgn_name === "CIRCULATION_PUMP_STATUS") {
  if (
    typeof p.output_status === "string" &&
    p.output_status !== "Not Available"
  ) {
    publishSensor(`circ_pump_${i}_status`, p.output_status, () =>
      sensorConfig(
        `circ_pump_${i}_status`,
        `Circ Pump${i_name} Status`,
        null,
        null,
        null,
        "mdi:pump",
      ),
    );
  }

  if (typeof p.pump_running === "boolean") {
    publishBinary(`circ_pump_${i}_running`, onOff(p.pump_running), () =>
      binarySensorConfig(
        `circ_pump_${i}_running`,
        `Circ Pump${i_name} Running`,
        "running",
        "mdi:pump",
      ),
    );
  }

  if (typeof p.has_fault === "boolean") {
    publishBinary(`circ_pump_${i}_fault`, onOff(p.has_fault), () =>
      binarySensorConfig(
        `circ_pump_${i}_fault`,
        `Circ Pump${i_name} Fault`,
        "problem",
        "mdi:alert-circle",
      ),
    );
  }

  // AquaHot 125D: per-zone pump binary sensors (byte 3 in 1FE97)
  if (typeof p.front_pump_running === "boolean") {
    publishBinary("aquahot_front_pump", onOff(p.front_pump_running), () =>
      aquahotBinarySensorConfig(
        "aquahot_front_pump",
        "Front Zone Pump",
        "running",
        "mdi:pump",
      ),
    );
    // Global file context: read by republish_aquahot_pump_state.js on the
    // Aqua-Hot tab, so flow context would not be visible there.
    global.set("aquahot_pump_front_state", onOff(p.front_pump_running), "file");
  }

  if (typeof p.floor_pump_running === "boolean") {
    publishBinary("aquahot_floor_pump", onOff(p.floor_pump_running), () =>
      aquahotBinarySensorConfig(
        "aquahot_floor_pump",
        "Floor Zone Pump",
        "running",
        "mdi:pump",
      ),
    );
    global.set("aquahot_pump_floor_state", onOff(p.floor_pump_running), "file");
  }
}

if (messages.length === 0) {
  return null;
}

return [messages];
