// Index retained Home Assistant discovery configs and attach the RV-C binding
// known by LibreCoach's entity publishers. The index is the stable join point:
// Home Assistant may rename entity_id, but MQTT discovery unique_id remains the
// original LibreCoach identity.
//
// Output: one refresh trigger whenever a discovery entity is created, changed,
// or removed. A downstream trigger node debounces startup/deploy bursts.

const INTEGRATION_PREFIXES = ["victron", "microair", "hughes"];
const ENTITY_MAP_KEY = "entityMapDiscovery";

function stateBinding({
  dgn,
  decoder,
  selector,
  signals,
  projection,
  authority,
  role = "state",
}) {
  return {
    role,
    protocol: "rvc",
    authority,
    decoder_key: decoder,
    dgn,
    selector,
    required_signals: signals,
    projection,
  };
}

function commandBinding({ dgn, decoder, selector, authority }) {
  return {
    role: "command",
    protocol: "rvc",
    authority,
    decoder_key: decoder,
    dgn,
    selector,
    required_signals: [],
    descriptive_only: true,
  };
}

function aquahotBinding(field, projection, role = "state") {
  return {
    role,
    protocol: "rvc-pdu1",
    authority: role === "state"
      ? "librecoach-node-red:status_aquahot_silverleaf"
      : "librecoach-node-red:encode_aquahot_command_silverleaf",
    decoder_key: role === "state"
      ? "SILVERLEAF_AQUAHOT_STATUS"
      : "SILVERLEAF_AQUAHOT_COMMAND",
    pf: "EF",
    operation: role === "state" ? 0xa9 : 0xab,
    selector: { kind: "singleton", value: "aquahot" },
    required_signals: role === "state" ? [field] : [],
    product_family: { models: ["TM220", "TM225", "TM226", "TM229"] },
    ...(role === "state" ? { projection } : { descriptive_only: true }),
  };
}

function bindingsFor(uniqueId) {
  let match;
  if ((match = /^switch_(\d+)$/.exec(uniqueId))) {
    const selector = { kind: "numeric", value: Number(match[1]) };
    return [
      stateBinding({
        dgn: "1FEDA",
        decoder: "DC_DIMMER_STATUS_3",
        selector,
        signals: ["instance", "operating_status", "load_status"],
        projection: { kind: "field", field: "operating_status" },
        authority: "librecoach-node-red:status_dc_dimmer_3",
      }),
      stateBinding({
        dgn: "1FFBB",
        decoder: "DC_DIMMER_STATUS_1",
        selector,
        signals: ["instance", "master_brightness"],
        projection: { kind: "field", field: "master_brightness" },
        authority: "librecoach-node-red:status_dc_dimmer_3",
      }),
      stateBinding({
        dgn: "16F00",
        decoder: "DC_COMPONENT_DRIVER_STATUS_1",
        selector,
        signals: [
          "device_instance", "driver_index", "output_status",
          "desired_status", "shutdown_status",
        ],
        projection: { kind: "field", field: "output_status" },
        authority: "librecoach-node-red:status_dc_driver",
      }),
      stateBinding({
        dgn: "16300",
        decoder: "DC_COMPONENT_DRIVER_STATUS_6",
        selector,
        signals: [
          "device_instance", "driver_index", "direction",
          "driver_pulsing", "lock_status", "command_timeout",
          "pwm_duty_cycle", "override_input",
        ],
        projection: { kind: "field", field: "pwm_duty_cycle" },
        authority: "librecoach-node-red:status_dc_driver",
      }),
      commandBinding({
        dgn: "1FEDB",
        decoder: "DC_DIMMER_COMMAND_2",
        selector,
        authority: "librecoach-node-red:encode_dc_dimmer_command_2",
      }),
      commandBinding({
        dgn: "16000",
        decoder: "DC_COMPONENT_DRIVER_COMMAND",
        selector,
        authority: "librecoach-node-red:encode_dc_driver_command",
      }),
    ];
  }

  if ((match = /^switch_l_(\d+)$/.exec(uniqueId))) {
    const selector = { kind: "numeric", value: Number(match[1]) };
    return [
      stateBinding({
        dgn: "1FFBD",
        decoder: "DC_LOAD_STATUS",
        selector,
        signals: [
          "instance", "group", "operating_status", "operating_mode",
          "variable_level_capability", "priority",
        ],
        projection: {
          kind: "field",
          field: "operating_status",
          unavailable: ["Error", "Reserved", "Out of Range", "Not Available"],
        },
        authority: "librecoach-node-red:status_dc_load",
      }),
      stateBinding({
        dgn: "1FEDC",
        decoder: "DC_LOAD_STATUS_2",
        selector,
        signals: [
          "instance", "lock_status", "overcurrent_status",
          "override_status", "enable_status", "last_command",
          "interlock_status", "driver_direction_status",
        ],
        authority: "librecoach-node-red:decode_dc_load_status",
        role: "corroboration",
      }),
      commandBinding({
        dgn: "1FFBC",
        decoder: "DC_LOAD_COMMAND",
        selector,
        authority: "librecoach-node-red:encode_dc_load_command",
      }),
    ];
  }

  if ((match = /^switch_ac_(\d+)$/.exec(uniqueId))) {
    const selector = { kind: "numeric", value: Number(match[1]) };
    return [
      stateBinding({
        dgn: "1FFBF",
        decoder: "AC_LOAD_STATUS",
        selector,
        signals: [
          "instance", "group", "operating_status", "operating_mode",
          "variable_level_capability", "priority",
        ],
        projection: {
          kind: "field",
          field: "operating_status",
          unavailable: ["Error", "Reserved", "Out of Range", "Not Available"],
        },
        authority: "librecoach-node-red:status_ac_load",
      }),
      stateBinding({
        dgn: "1FEDD",
        decoder: "AC_LOAD_STATUS_2",
        selector,
        signals: [
          "instance", "lock_status", "overcurrent_status",
          "override_status", "enable_status", "last_command",
          "interlock_status", "driver_direction_status",
        ],
        authority: "librecoach-node-red:decode_ac_load_status",
        role: "corroboration",
      }),
      commandBinding({
        dgn: "1FFBE",
        decoder: "AC_LOAD_COMMAND",
        selector,
        authority: "librecoach-node-red:encode_ac_load_command",
      }),
    ];
  }

  if ((match = /^switch_i_(\d+)$/.exec(uniqueId))) {
    const selector = { kind: "numeric", value: Number(match[1]) };
    return [
      stateBinding({
        dgn: "1FED7",
        decoder: "GENERIC_INDICATOR_STATUS",
        selector,
        signals: [
          "instance", "group", "brightness", "bank_select",
          "delay_duration", "led_1_status", "led_2_status", "last_command",
        ],
        projection: {
          kind: "field",
          field: "brightness",
          unavailable: ["Error", "Reserved", "Out of Range", "Not Available"],
        },
        authority: "librecoach-node-red:status_generic_indicator_cmd",
      }),
      commandBinding({
        dgn: "1FED9",
        decoder: "GENERIC_INDICATOR_COMMAND",
        selector,
        authority: "librecoach-node-red:encode_generic_indicator_command",
      }),
    ];
  }

  if ((match = /^switch_g_(\d+)$/.exec(uniqueId))) {
    return [commandBinding({
      dgn: "1FED9",
      decoder: "GENERIC_INDICATOR_COMMAND",
      selector: {
        kind: "semantic",
        value: Number(match[1]),
        semantic: "indicator-group",
      },
      authority: "librecoach-node-red:encode_generic_indicator_command",
    })];
  }

  if ((match = /^shade_(\d+)$/.exec(uniqueId))) {
    const selector = { kind: "numeric", value: Number(match[1]) };
    return [
      stateBinding({
        dgn: "1FEDE",
        decoder: "WINDOW_SHADE_CONTROL_STATUS",
        selector,
        signals: [
          "instance", "motor_status", "forward_status",
          "reverse_status", "operating_status",
        ],
        projection: { kind: "field", field: "operating_status" },
        authority: "librecoach-node-red:status_shade",
      }),
      commandBinding({
        dgn: "1FEDF",
        decoder: "WINDOW_SHADE_CONTROL_COMMAND",
        selector,
        authority: "librecoach-node-red:encode_shade_command",
      }),
    ];
  }

  if ((match = /^lock_(\d+)$/.exec(uniqueId))) {
    const instance = Number(match[1]);
    const selector = { kind: "numeric", value: instance };
    const bindings = [];
    if (instance !== 0) {
      bindings.push(stateBinding({
        dgn: "1FEE5",
        decoder: "LOCK_STATUS",
        selector,
        signals: ["instance", "lock_status", "position"],
        projection: { kind: "field", field: "lock_status" },
        authority: "librecoach-node-red:status_lock",
      }));
    }
    bindings.push(commandBinding({
      dgn: "1FEE4",
      decoder: "LOCK_COMMAND",
      selector,
      authority: "librecoach-node-red:encode_lock_command",
    }));
    return bindings;
  }

  const tankInstances = {
    fresh: [0, "fresh-water"],
    black: [1, "black-water"],
    gray: [2, "gray-water"],
    lpg: [3, "lpg"],
    fresh2: [16, "fresh-water-2"],
    black2: [17, "black-water-2"],
    gray2: [18, "gray-water-2"],
    lpg2: [19, "lpg-2"],
  };
  if ((match = /^tank_(fresh2?|black2?|gray2?|lpg2?)$/.exec(uniqueId))) {
    const [value, semantic] = tankInstances[match[1]];
    return [stateBinding({
      dgn: "1FFB7",
      decoder: "TANK_STATUS",
      selector: { kind: "semantic", value, semantic },
      signals: ["instance", "relative_level", "resolution", "level_percentage"],
      projection: { kind: "field", field: "level_percentage" },
      authority: "librecoach-node-red:status_tank",
    })];
  }

  const batteryInstances = {
    house: [1, "house"],
    chassis: [2, "chassis"],
    house2: [3, "house-2"],
    generator: [4, "generator"],
  };
  if ((match = /^battery_(house|chassis|house2|generator|\d+)$/.exec(uniqueId))) {
    const known = batteryInstances[match[1]];
    const value = known ? known[0] : Number(match[1]);
    if (!Number.isInteger(value) || value < 1 || value > 250) return [];
    const selector = known
      ? { kind: "semantic", value, semantic: known[1] }
      : { kind: "numeric", value };
    return [
      stateBinding({
        dgn: "1FFFD",
        decoder: "DC_SOURCE_STATUS_1",
        selector,
        signals: ["instance", "dc_voltage"],
        projection: { kind: "field", field: "dc_voltage" },
        authority: "librecoach-node-red:status_battery",
      }),
      stateBinding({
        dgn: "1FFFC",
        decoder: "DC_SOURCE_STATUS_2",
        selector,
        signals: ["instance", "source_temperature", "state_of_charge"],
        projection: { kind: "field", field: "state_of_charge" },
        authority: "librecoach-node-red:decode_dc_source_status",
        role: "corroboration",
      }),
      stateBinding({
        dgn: "1FFFB",
        decoder: "DC_SOURCE_STATUS_3",
        selector,
        signals: ["instance", "state_of_health", "relative_capacity"],
        projection: { kind: "field", field: "state_of_health" },
        authority: "librecoach-node-red:decode_dc_source_status",
        role: "corroboration",
      }),
    ];
  }

  if (uniqueId === "water_pump") {
    const selector = { kind: "singleton", value: "water_pump" };
    return [
      stateBinding({
        dgn: "1FFB3",
        decoder: "WATER_PUMP_STATUS",
        selector,
        signals: ["operating_status"],
        projection: {
          kind: "enum",
          field: "operating_status",
          values: { Off: "OFF", On: "ON" },
          unavailable: ["Reserved", "Not Available"],
        },
        authority: "librecoach-node-red:status_water_pump",
      }),
      commandBinding({
        dgn: "1FFB2",
        decoder: "WATER_PUMP_COMMAND",
        selector,
        authority: "librecoach-node-red:encode_water_pump_command",
      }),
    ];
  }

  if (uniqueId === "autofill") {
    const selector = { kind: "singleton", value: "autofill" };
    return [
      stateBinding({
        dgn: "1FFB1",
        decoder: "AUTOFILL_STATUS",
        selector,
        signals: ["operating_status", "valve_status", "last_operation"],
        projection: {
          kind: "field",
          field: "operating_status",
          unavailable: ["Reserved", "Not Available"],
        },
        authority: "librecoach-node-red:status_autofill",
      }),
      commandBinding({
        dgn: "1FFB0",
        decoder: "AUTOFILL_COMMAND",
        selector,
        authority: "librecoach-node-red:encode_autofill_command",
      }),
    ];
  }

  if ((match = /^floor_heat_(\d+)$/.exec(uniqueId))) {
    const selector = { kind: "numeric", value: Number(match[1]) };
    return [
      stateBinding({
        dgn: "1FEFC",
        decoder: "FLOOR_HEAT_STATUS",
        selector,
        signals: [
          "instance", "operating_mode", "operating_status",
          "heat_element_status", "schedule_mode",
          "measured_temperature", "set_point", "dead_band",
        ],
        projection: {
          kind: "enum",
          field: "operating_status",
          values: { Off: "off", On: "heat" },
          unavailable: ["Reserved", "Not Available"],
        },
        authority: "librecoach-node-red:create_floor_heat",
      }),
      commandBinding({
        dgn: "1FEFB",
        decoder: "FLOOR_HEAT_COMMAND",
        selector,
        authority: "librecoach-node-red:encode_floor_heat_command",
      }),
    ];
  }

  if ((match = /^thermostat_zone_(\d+)$/.exec(uniqueId))) {
    const selector = { kind: "numeric", value: Number(match[1]) };
    return [
      stateBinding({
        dgn: "1FFE2",
        decoder: "THERMOSTAT_STATUS_1",
        selector,
        signals: [
          "instance", "operating_mode", "fan_mode", "schedule_mode",
          "fan_speed", "setpoint_heat", "setpoint_cool",
        ],
        projection: { kind: "field", field: "operating_mode" },
        authority: "librecoach-node-red:status_thermostat",
      }),
      stateBinding({
        dgn: "1FEFA",
        decoder: "THERMOSTAT_STATUS_2",
        selector,
        signals: [
          "instance", "current_schedule_instance",
          "number_of_schedule_instances", "reduced_noise_mode",
          "eco_mode", "turbo_mode",
        ],
        authority: "librecoach-node-red:decode_thermostat_status_2",
        role: "corroboration",
      }),
      commandBinding({
        dgn: "1FEF9",
        decoder: "THERMOSTAT_COMMAND_1",
        selector,
        authority: "librecoach-node-red:encode_thermostat_command",
      }),
    ];
  }

  if ((match = /^thermostat_ambient_zone(\d+)$/.exec(uniqueId))) {
    const selector = { kind: "numeric", value: Number(match[1]) };
    return [stateBinding({
      dgn: "1FF9C",
      decoder: "THERMOSTAT_AMBIENT_STATUS",
      selector,
      signals: ["instance", "ambient_temperature"],
      projection: {
        kind: "field",
        field: "ambient_temperature",
        unavailable: ["Reserved", "Out of Range", "Not Available"],
      },
      authority: "librecoach-node-red:status_thermostat_ambient",
    })];
  }

  const aquahot = {
    aquahot_burner: ["diesel_burner", {
      kind: "field",
      field: "diesel_burner",
      unavailable: ["Reserved", "Not Available"],
    }],
    aquahot_ac_1: ["electric_selector", {
      kind: "equals",
      field: "electric_selector",
      value: "AC 1",
      unavailable: ["Reserved", "Not Available"],
    }],
    aquahot_ac_2: ["electric_selector", {
      kind: "equals",
      field: "electric_selector",
      value: "AC 2",
      unavailable: ["Reserved", "Not Available"],
    }],
    aquahot_engine: ["engine_preheat", {
      kind: "field",
      field: "engine_preheat",
      unavailable: ["Reserved", "Not Available"],
    }],
  };
  if (aquahot[uniqueId]) {
    const [field, projection] = aquahot[uniqueId];
    return [
      aquahotBinding(field, projection),
      aquahotBinding(null, null, "command"),
    ];
  }

  return [];
}

function discoveryTopic(topic) {
  const parts = String(topic || "").split("/");
  if (parts[0] !== "homeassistant" || parts.at(-1) !== "config") return null;
  if (parts.length === 4) {
    return { component: parts[1], objectId: parts[2] };
  }
  if (parts.length === 5) {
    return { component: parts[1], objectId: parts[3] };
  }
  return null;
}

const topic = msg.topic;
const parsedTopic = discoveryTopic(topic);
if (!parsedTopic) return null;

const integrationIndex = global.get("discoveryIndex", "file") || {};
const entityIndex = global.get(ENTITY_MAP_KEY, "file") || {};
const raw = msg.payload;
const isEmpty =
  raw === "" ||
  raw === null ||
  raw === undefined ||
  (typeof raw === "object" && Object.keys(raw).length === 0);

if (isEmpty) {
  let changed = false;
  for (const prefix of INTEGRATION_PREFIXES) {
    const topics = integrationIndex[prefix];
    const index = topics ? topics.indexOf(topic) : -1;
    if (index !== -1) {
      topics.splice(index, 1);
      changed = true;
    }
  }
  if (entityIndex[topic]) {
    delete entityIndex[topic];
    global.set(ENTITY_MAP_KEY, entityIndex, "file");
    changed = true;
  }
  if (changed) global.set("discoveryIndex", integrationIndex, "file");
  return changed
    ? { topic: "entity-map-refresh", payload: { reason: "discovery-removed" } }
    : null;
}

let config = raw;
if (typeof raw === "string") {
  try {
    config = JSON.parse(raw);
  } catch {
    return null;
  }
}
const uniqueId = config && config.unique_id;
if (typeof uniqueId !== "string" || !uniqueId) return null;

const prefix = INTEGRATION_PREFIXES.find((value) =>
  uniqueId.startsWith(value + "_"));
if (prefix) {
  const topics = integrationIndex[prefix] ||
    (integrationIndex[prefix] = []);
  if (!topics.includes(topic)) {
    topics.push(topic);
    global.set("discoveryIndex", integrationIndex, "file");
  }
}

const stateTopics = Object.entries(config)
  .filter(([key, value]) =>
    /(?:^|_)state_topic$/.test(key) && typeof value === "string")
  .map(([, value]) => value);
const commandTopics = Object.entries(config)
  .filter(([key, value]) =>
    /(?:^|_)command_topic$/.test(key) && typeof value === "string")
  .map(([, value]) => value);

entityIndex[topic] = {
  topic,
  component: parsedTopic.component,
  object_id: parsedTopic.objectId,
  unique_id: uniqueId,
  original_name: typeof config.name === "string"
    ? config.name : parsedTopic.objectId,
  default_entity_id: typeof config.default_entity_id === "string"
    ? config.default_entity_id
    : `${parsedTopic.component}.${parsedTopic.objectId}`,
  state_topics: [...new Set(stateTopics)],
  command_topics: [...new Set(commandTopics)],
  bindings: bindingsFor(uniqueId),
};
global.set(ENTITY_MAP_KEY, entityIndex, "file");
node.status({
  fill: "blue",
  shape: "dot",
  text: `${Object.keys(entityIndex).length} discoveries`,
});

return {
  topic: "entity-map-refresh",
  payload: { reason: "discovery-updated", unique_id: uniqueId },
};
