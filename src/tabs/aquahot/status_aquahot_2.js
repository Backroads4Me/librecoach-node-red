// Publishes proprietary AquaHot zone entity states to MQTT state topics.
// Also publishes MQTT discovery configs the first time a valid value is received.
//
// ROUTING: This node handles 5 DGN names. Four are proprietary AquaHot DGNs
// (FF01, FF2F, FF2E, 6C00) routed from decode_aquahot_status_2. The fifth is
// WATERHEATER_STATUS_2 (1FE99) which must ALSO be routed here (in addition to
// status_waterheater) so zone_active flags can update the climate entities.

if (!msg.payload || typeof msg.payload !== "object") {
  node.warn("Invalid payload: expected object");
  return null;
}

const p = msg.payload;
const dgn_name = p.dgn_name;
const messages = [];

// === Device definition ===

// Shared device explicitly with standard water heater entities
const device = {
  identifiers: ["librecoach-aquahot"],
  name: "Aqua-Hot",
  manufacturer: "LibreCoach",
};

// === Flow context ===

const CREATED_KEY = "aquahot_zone_entities_created_v2";
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
      {
        topic: "librecoach/nodered/status",
        payload_available: "online",
        payload_not_available: "offline",
      },
      {
        topic: "can/status",
        value_template: "{{ 'online' if value == 'online' else 'offline' }}",
        payload_available: "online",
        payload_not_available: "offline",
      },
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
        {
          topic: "librecoach/nodered/status",
          payload_available: "online",
          payload_not_available: "offline",
        },
        {
          topic: "can/status",
          value_template: "{{ 'online' if value == 'online' else 'offline' }}",
          payload_available: "online",
          payload_not_available: "offline",
        },
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
      availability_mode: "all",
      availability: [
        {
          topic: "librecoach/nodered/status",
          payload_available: "online",
          payload_not_available: "offline",
        },
        {
          topic: "can/status",
          value_template: "{{ 'online' if value == 'online' else 'offline' }}",
          payload_available: "online",
          payload_not_available: "offline",
        },
      ],
      device,
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

function climateConfig(entityId, name) {
  const cfg = {
    name,
    unique_id: entityId,
    default_entity_id: `climate.${entityId}`,
    mode_state_topic: `homeassistant/climate/${entityId}/mode/state`,
    mode_command_topic: `homeassistant/climate/${entityId}/mode/set`,
    modes: ["off", "heat"],
    current_temperature_topic: `homeassistant/climate/${entityId}/current_temp/state`,
    temperature_unit: "F",
    action_topic: `homeassistant/climate/${entityId}/action/state`,
    optimistic: true,
    availability_mode: "all",
    availability: [
      {
        topic: "librecoach/nodered/status",
        payload_available: "online",
        payload_not_available: "offline",
      },
      {
        topic: "can/status",
        value_template: "{{ 'online' if value == 'online' else 'offline' }}",
        payload_available: "online",
        payload_not_available: "offline",
      },
    ],
    device,
  };
  return {
    topic: `homeassistant/climate/${entityId}/config`,
    payload: cfg,
  };
}

function publishClimate(entityId, mode, temp, action, configFn) {
  const isNew = !created[entityId];
  if (isNew) {
    messages.push(configFn());
    markCreated(entityId);
  }
  if (mode !== undefined) {
    let haMode = "off";
    if (mode === "HEAT") haMode = "heat";
    messages.push(
      stateMsg(`homeassistant/climate/${entityId}/mode/state`, haMode),
    );
  } else if (isNew) {
    // Default to "off" on first creation to prevent HA showing "Unknown"
    messages.push(
      stateMsg(`homeassistant/climate/${entityId}/mode/state`, "off"),
    );
  }
  if (temp !== undefined && temp !== null) {
    messages.push(
      stateMsg(`homeassistant/climate/${entityId}/current_temp/state`, temp),
    );
  }
  if (action !== undefined) {
    const haAction = action ? "heating" : "idle";
    messages.push(
      stateMsg(`homeassistant/climate/${entityId}/action/state`, haAction),
    );
  }
}

// Parse hex format helper
function toHex(val) {
  return "0x" + val.toString(16).toUpperCase().padStart(2, "0");
}

// === AQUAHOT_THERMOSTAT_STATUS_2 (FF01) ===
// Provides current zone temperature
if (dgn_name === "AQUAHOT_THERMOSTAT_STATUS_2") {
  const z = p.zone_index + 1; // 00=Zone 1, 01=Zone 2

  if (typeof p.zone_temperature === "number") {
    // Create Climate Entity and publish current temperature
    publishClimate(
      `aquahot_zone_${z}`,
      undefined, // Mode handled by FF2F
      p.zone_temperature, // Current temp
      undefined, // Action handled by FF2F
      () => climateConfig(`aquahot_zone_${z}`, `Zone ${z}`),
    );
  }

  if (typeof p.config_byte === "number") {
    publishSensor(`aquahot_zone_${z}_config`, toHex(p.config_byte), () =>
      sensorConfig(
        `aquahot_zone_${z}_config`,
        `Zone ${z} Config`,
        null,
        null,
        null,
        "mdi:cog",
      ),
    );
  }
}

// === AQUAHOT_COMMAND_2 (FF2F) ===
// Event-driven commands from 0x9E. Not periodic — only sent on state changes.
else if (dgn_name === "AQUAHOT_COMMAND_2") {
  if (p.command_type === 0x07 && typeof p.quiet_mode_on === "boolean") {
    // Quiet Mode on/off
    publishSwitch("aquahot_quiet_mode", onOff(p.quiet_mode_on), () =>
      switchConfig(
        "aquahot_quiet_mode",
        "Quiet Mode",
        "mdi:volume-off",
        "homeassistant/switch/aquahot_quiet_mode/set",
      ),
    );
  } else if (
    p.command_type === 0x0a &&
    typeof p.interior_heating_on === "boolean"
  ) {
    // Interior Heating Priority on/off
    publishSwitch(
      "aquahot_interior_heating",
      onOff(p.interior_heating_on),
      () =>
        switchConfig(
          "aquahot_interior_heating",
          "Interior Heating Priority",
          "mdi:home-thermometer",
          "homeassistant/switch/aquahot_interior_heating/set",
        ),
    );
  }
}

// === WATERHEATER_STATUS_2 (1FE99) — AquaHot zone active flags ===
// On AquaHot systems, byte 2 bits 0 and 2 encode per-zone active state.
// VALIDATED: C0=none, C1=zone_0, C4=zone_1, C5=both (from recordings)
// Route WATERHEATER_STATUS_2 to this node in addition to the standard decoder.
else if (dgn_name === "WATERHEATER_STATUS_2") {
  if (Array.isArray(p.zone_active)) {
    for (let i = 0; i < p.zone_active.length; i++) {
      const active = p.zone_active[i];
      if (typeof active !== "boolean") continue;
      const z = i + 1;
      const mode = active ? "HEAT" : "OFF";
      publishClimate(`aquahot_zone_${z}`, mode, undefined, active, () =>
        climateConfig(`aquahot_zone_${z}`, `Zone ${z}`),
      );
    }
  }

  // Corroborating confirmation, independent of the raw FF2F echo — 1FE99
  // is broadcast continuously by the AquaHot regardless of who issued the
  // last command, so this self-heals even when LibreCoach's own outgoing
  // commands aren't looped back into decode.
  if (typeof p.interior_heating_confirmed_on === "boolean") {
    publishSwitch(
      "aquahot_interior_heating",
      onOff(p.interior_heating_confirmed_on),
      () =>
        switchConfig(
          "aquahot_interior_heating",
          "Interior Heating Priority",
          "mdi:home-thermometer",
          "homeassistant/switch/aquahot_interior_heating/set",
        ),
    );
  }
}

// === AQUAHOT_STATUS_2 (6C00) ===
else if (dgn_name === "AQUAHOT_STATUS_2") {
  const nn = toHex(p.sub_index).substring(2);
  if (p.value_a !== undefined && p.value_a !== null) {
    publishSensor(`aquahot_status_2_sub_${nn}`, p.value_a, () =>
      sensorConfig(
        `aquahot_status_2_sub_${nn}`,
        `Status Sub ${nn}`,
        null,
        null,
        null,
        "mdi:information",
      ),
    );
  }
}

// === AQUAHOT_SYSTEM_STATUS_2 (FF2E) ===
else if (dgn_name === "AQUAHOT_SYSTEM_STATUS_2") {
  const nn = toHex(p.sub_index).substring(2);

  if (p.primary_value !== undefined && p.primary_value !== null) {
    publishSensor(`aquahot_sys_status_sub_${nn}`, p.primary_value, () =>
      sensorConfig(
        `aquahot_sys_status_sub_${nn}`,
        `System Status Sub ${nn}`,
        null,
        null,
        null,
        "mdi:information",
      ),
    );
  }

  // Corroborating confirmation, independent of the raw FF2F echo — this
  // burst fires after ANY FF2F, including LibreCoach's own commands that
  // are not looped back into the decode pipeline.
  if (typeof p.quiet_mode_confirmed_on === "boolean") {
    publishSwitch("aquahot_quiet_mode", onOff(p.quiet_mode_confirmed_on), () =>
      switchConfig(
        "aquahot_quiet_mode",
        "Quiet Mode",
        "mdi:volume-off",
        "homeassistant/switch/aquahot_quiet_mode/set",
      ),
    );
  }
}

if (messages.length === 0) {
  return null;
}

return [messages];
