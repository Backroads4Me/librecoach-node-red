// Publishes generator entity states to MQTT state topics.
// Also publishes MQTT discovery configs the first time a valid value is
// received for each entity.
// Handles output from decode_generator_status.js and decode_generator_ac_status.js.

if (!msg.payload || typeof msg.payload !== "object") {
  node.warn("Invalid payload: expected object");
  return null;
}

const p = msg.payload;
const dgn_name = p.dgn_name;
const messages = [];

// --- Device definition ---

const device = {
  identifiers: ["librecoach-generator"],
  name: "Generator",
  manufacturer: "LibreCoach",
};

// --- Flow context: tracks which entities have had discovery published ---

const CREATED_KEY = "generator_entities_created";
const created = flow.get(CREATED_KEY) || {};

function markCreated(entityId) {
  created[entityId] = true;
  flow.set(CREATED_KEY, created);
}

// --- Discovery config builders ---

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

// --- Helpers ---

function stateMsg(topic, payload) {
  return { topic, payload };
}

function onOff(value) {
  return value ? "ON" : "OFF";
}

// Publish discovery config the first time a valid value is seen for an entity,
// then always publish the state.
// canCreate: pass a reasonableness check expression — entity won't be created
// until the value makes physical sense (e.g., RPM > 0 means engine is spinning).
// Once created, state is always published (including zeros).
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

// --- STATUS_1 ---

if (dgn_name === "GENERATOR_STATUS_1") {
  if (typeof p.generator_running === "boolean") {
    flow.set("generator_running", p.generator_running);
  }

  if (typeof p.status === "string" && p.status !== "Not Available") {
    publishSensor("generator_status", p.status, () =>
      sensorConfig(
        "generator_status",
        "Generator Status",
        null,
        null,
        null,
        "mdi:engine",
      ),
    );
  }

  if (typeof p.engine_run_time === "number") {
    publishSensor(
      "generator_run_time",
      p.engine_run_time,
      () =>
        sensorConfig(
          "generator_run_time",
          "Generator Run Time",
          "h",
          null,
          "total_increasing",
          "mdi:timer",
        ),
      p.engine_run_time > 0,
    );
  }

  if (typeof p.engine_load === "number") {
    publishSensor("generator_engine_load", p.engine_load, () =>
      sensorConfig(
        "generator_engine_load",
        "Generator Engine Load",
        "%",
        null,
        "measurement",
        "mdi:gauge",
      ),
    );
  }

  if (typeof p.start_battery_voltage === "number") {
    publishSensor(
      "generator_battery_voltage",
      p.start_battery_voltage,
      () =>
        sensorConfig(
          "generator_battery_voltage",
          "Generator Battery Voltage",
          "V",
          "voltage",
          "measurement",
          "mdi:battery",
        ),
      p.start_battery_voltage > 0,
    );
  }

  if (typeof p.generator_fault === "boolean") {
    publishBinary("generator_fault", onOff(p.generator_fault), () =>
      binarySensorConfig(
        "generator_fault",
        "Generator Fault",
        "problem",
        "mdi:alert-circle",
      ),
    );
  }

  if (typeof p.generator_running === "boolean") {
    if (!created["generator_control"]) {
      messages.push({
        topic: "homeassistant/switch/generator_control/config",
        payload: {
          name: "Generator Control",
          unique_id: "generator_control",
          default_entity_id: "switch.generator_control",
          state_topic: "homeassistant/switch/generator_control/state",
          command_topic: "homeassistant/switch/generator_control/set",
          payload_on: "ON",
          payload_off: "OFF",
          icon: "mdi:engine",
          availability_mode: "all",
          availability: [
            { topic: "librecoach/nodered/status", payload_available: "online", payload_not_available: "offline" },
            { topic: "can/status", value_template: "{{ 'online' if value == 'online' else 'offline' }}", payload_available: "online", payload_not_available: "offline" },
          ],
          device,
        },
      });
      markCreated("generator_control");
    }
    messages.push(
      stateMsg(
        "homeassistant/switch/generator_control/state",
        onOff(p.generator_running),
      ),
    );
  }

  // --- STATUS_2 ---
} else if (dgn_name === "GENERATOR_STATUS_2") {
  const generatorActive =
    (typeof p.engine_rpm === "number" && p.engine_rpm > 0) ||
    flow.get("generator_running") === true;

  if (typeof p.coolant_temperature === "number") {
    const coolantTemperature = generatorActive
      ? Math.round(p.coolant_temperature)
      : 0;
    publishSensor(
      "generator_coolant_temp",
      coolantTemperature,
      () =>
        sensorConfig(
          "generator_coolant_temp",
          "Generator Coolant Temp",
          "°F",
          "temperature",
          "measurement",
          "mdi:thermometer",
        ),
      generatorActive,
    );
  }

  if (typeof p.oil_pressure === "number") {
    publishSensor(
      "generator_oil_pressure",
      p.oil_pressure,
      () =>
        sensorConfig(
          "generator_oil_pressure",
          "Generator Oil Pressure",
          "kPa",
          "pressure",
          "measurement",
          "mdi:gauge",
        ),
      p.oil_pressure > 0,
    );
  }

  if (typeof p.engine_rpm === "number") {
    publishSensor(
      "generator_rpm",
      p.engine_rpm,
      () =>
        sensorConfig(
          "generator_rpm",
          "Generator RPM",
          "RPM",
          null,
          "measurement",
          "mdi:rotate-right",
        ),
      p.engine_rpm > 0,
    );
  }

  if (typeof p.fuel_rate === "number") {
    publishSensor("generator_fuel_rate", p.fuel_rate, () =>
      sensorConfig(
        "generator_fuel_rate",
        "Generator Fuel Rate",
        "L/h",
        null,
        "measurement",
        "mdi:fuel",
      ),
    );
  }

  if (typeof p.caution_light_on === "boolean") {
    publishBinary("generator_caution", onOff(p.caution_light_on), () =>
      binarySensorConfig(
        "generator_caution",
        "Generator Caution",
        "problem",
        "mdi:alert",
      ),
    );
  }

  // --- GENERATOR_DEMAND_STATUS ---
} else if (dgn_name === "GENERATOR_DEMAND_STATUS") {
  if (typeof p.quiet_time_active === "boolean") {
    publishBinary("generator_quiet_time", onOff(p.quiet_time_active), () =>
      binarySensorConfig(
        "generator_quiet_time",
        "Generator Quiet Time",
        null,
        "mdi:moon-waning-crescent",
      ),
    );
  }

  // --- GENERATOR_AC_STATUS_1 ---
} else if (dgn_name === "GENERATOR_AC_STATUS_1") {
  const active = !!p.ac_output_active;

  if (typeof p.rms_voltage === "number") {
    publishSensor(
      "generator_ac_voltage",
      active ? p.rms_voltage : 0,
      () =>
        sensorConfig(
          "generator_ac_voltage",
          "Generator AC Voltage",
          "V",
          "voltage",
          "measurement",
          "mdi:lightning-bolt",
        ),
      active,
    );
  }

  if (typeof p.rms_current === "number") {
    publishSensor(
      "generator_ac_current",
      active ? p.rms_current : 0,
      () =>
        sensorConfig(
          "generator_ac_current",
          "Generator AC Current",
          "A",
          "current",
          "measurement",
          "mdi:current-ac",
        ),
      active,
    );
  }

  if (typeof p.frequency === "number") {
    publishSensor(
      "generator_frequency",
      active ? p.frequency : 0,
      () =>
        sensorConfig(
          "generator_frequency",
          "Generator Frequency",
          "Hz",
          "frequency",
          "measurement",
          "mdi:sine-wave",
        ),
      active,
    );
  }

  if (typeof p.rms_voltage === "number" && typeof p.rms_current === "number") {
    const power = active
      ? parseFloat((p.rms_voltage * p.rms_current).toFixed(1))
      : 0;
    publishSensor(
      "generator_ac_power",
      power,
      () =>
        sensorConfig(
          "generator_ac_power",
          "Generator AC Power",
          "VA",
          "apparent_power",
          "measurement",
          "mdi:flash",
        ),
      active,
    );
  }
}

if (messages.length === 0) {
  return null;
}

return [messages];
