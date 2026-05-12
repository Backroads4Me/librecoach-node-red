// HA Status Publisher for GO Power GP-RVC-30-MPPT Solar Controller
// Handles: SOLAR_CONTROLLER_BATTERY_STATUS (1FE80) - primary source
//          SOLAR_CONTROLLER_SOLAR_ARRAY_STATUS (1FDFF) - panel data
//          SOLAR_CONTROLLER_STATUS_6 (1FE81) - setpoints
// Self-creating: publishes MQTT discovery on first valid reading.

if (!msg.payload || typeof msg.payload !== "object") {
  return null;
}

const p = msg.payload;
const dgn = (p.dgn || "").toUpperCase();
const instance = p.instance;
const messages = [];

// Instance name map
const instanceNames = {
  1: { suffix: "house", label: "House Battery" },
  2: { suffix: "chassis", label: "Chassis Battery" },
};

const instInfo = instanceNames[instance] || {
  suffix: `${instance}`,
  label: `Battery ${instance}`,
};

// === Device definition ===
const device = {
  identifiers: ["librecoach-solar"],
  name: "Solar",
  manufacturer: "GO Power",
  model: "GP-RVC-30-MPPT",
};

// === Flow context: tracks which entities have had discovery published ===
const CREATED_KEY = "solarCreated";
const created = flow.get(CREATED_KEY) || {};

function markCreated(entityId) {
  created[entityId] = true;
  flow.set(CREATED_KEY, created);
}

function sensorConfig(entityId, name, unit, deviceClass, stateClass, icon) {
  const cfg = {
    name,
    unique_id: entityId,
    default_entity_id: `sensor.${entityId}`,
    state_topic: `homeassistant/sensor/${entityId}/state`,
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
      device,
    },
  };
}

function stateMsg(topic, payload) {
  return { topic, payload };
}

function onOff(value) {
  return value ? "ON" : "OFF";
}

function publishSensor(entityId, stateValue, configFn, canCreate = true) {
  if (stateValue === null || stateValue === undefined) return;
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
  messages.push(stateMsg(`homeassistant/binary_sensor/${entityId}/state`, stateValue));
}

// === SOLAR_CONTROLLER_BATTERY_STATUS (1FE80) ===
if (dgn === "1FE80") {
  const sfx = instInfo.suffix;
  const lbl = instInfo.label;

  // Battery voltage
  if (typeof p.battery_voltage === "number") {
    publishSensor(
      `solar_${sfx}_voltage`,
      p.battery_voltage,
      () => sensorConfig(
        `solar_${sfx}_voltage`,
        `${lbl} Voltage`,
        "V", "voltage", "measurement", "mdi:battery"
      )
    );
  }

  // Battery current
  if (typeof p.battery_current === "number") {
    publishSensor(
      `solar_${sfx}_current`,
      p.battery_current,
      () => sensorConfig(
        `solar_${sfx}_current`,
        `${lbl} Current`,
        "A", "current", "measurement", "mdi:current-dc"
      )
    );
  }

  // Battery watts
  if (typeof p.battery_watts === "number") {
    publishSensor(
      `solar_${sfx}_watts`,
      p.battery_watts,
      () => sensorConfig(
        `solar_${sfx}_watts`,
        `${lbl} Power`,
        "W", "power", "measurement", "mdi:solar-power"
      )
    );
  }

  // Charging stage
  if (typeof p.charging_stage === "string") {
    publishSensor(
      `solar_${sfx}_stage`,
      p.charging_stage,
      () => sensorConfig(
        `solar_${sfx}_stage`,
        `${lbl} Charge Stage`,
        null, null, null, "mdi:battery-charging"
      )
    );
  }

  // Battery temperature
  if (typeof p.battery_temperature === "number") {
    publishSensor(
      `solar_${sfx}_temperature`,
      p.battery_temperature,
      () => sensorConfig(
        `solar_${sfx}_temperature`,
        `${lbl} Temperature`,
        "°F", "temperature", "measurement", "mdi:thermometer"
      ),
      p.battery_temperature > 0 // Only create when we have a real reading
    );
  }

  // Charging active binary sensor
  if (typeof p.charging_active === "boolean") {
    publishBinary(
      `solar_${sfx}_charging`,
      onOff(p.charging_active),
      () => binarySensorConfig(
        `solar_${sfx}_charging`,
        `${lbl} Charging`,
        "battery_charging", "mdi:battery-charging"
      )
    );
  }

// === SOLAR_CONTROLLER_SOLAR_ARRAY_STATUS (1FDFF) ===
} else if (dgn === "1FDFF") {

  // Panel voltage — only one array, instance 1
  if (typeof p.panel_voltage === "number") {
    publishSensor(
      "solar_panel_voltage",
      p.panel_voltage,
      () => sensorConfig(
        "solar_panel_voltage",
        "Solar Panel Voltage",
        "V", "voltage", "measurement", "mdi:solar-panel"
      )
    );
  }

  // Panel current
  if (typeof p.panel_current === "number") {
    publishSensor(
      "solar_panel_current",
      p.panel_current,
      () => sensorConfig(
        "solar_panel_current",
        "Solar Panel Current",
        "A", "current", "measurement", "mdi:solar-panel"
      )
    );
  }

  // Panel watts
  if (typeof p.panel_watts === "number") {
    publishSensor(
      "solar_panel_watts",
      p.panel_watts,
      () => sensorConfig(
        "solar_panel_watts",
        "Solar Panel Power",
        "W", "power", "measurement", "mdi:solar-panel-large"
      )
    );
  }

  // Panels active binary
  if (typeof p.panels_active === "boolean") {
    publishBinary(
      "solar_panels_active",
      onOff(p.panels_active),
      () => binarySensorConfig(
        "solar_panels_active",
        "Solar Panels Active",
        "power", "mdi:solar-panel"
      )
    );
  }

// === SOLAR_CONTROLLER_STATUS_6 (1FE81) — charge setpoints ===
} else if (dgn === "1FE81") {

  if (typeof p.absorption_setpoint === "number" && p.absorption_setpoint > 10) {
    publishSensor(
      "solar_absorption_setpoint",
      p.absorption_setpoint,
      () => sensorConfig(
        "solar_absorption_setpoint",
        "Solar Absorption Setpoint",
        "V", "voltage", "measurement", "mdi:battery-charging-high"
      )
    );
  }

  if (typeof p.float_setpoint === "number" && p.float_setpoint > 10) {
    publishSensor(
      "solar_float_setpoint",
      p.float_setpoint,
      () => sensorConfig(
        "solar_float_setpoint",
        "Solar Float Setpoint",
        "V", "voltage", "measurement", "mdi:battery-charging-medium"
      )
    );
  }
}

if (messages.length === 0) {
  return null;
}

return [messages];