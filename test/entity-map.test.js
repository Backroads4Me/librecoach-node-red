"use strict";

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const configDir = path.join(__dirname, "..", "src", "tabs", "config");

function compile(name, parameters) {
  const body = fs.readFileSync(path.join(configDir, name), "utf8");
  return new Function(...parameters, body);
}

const indexDiscovery = compile("discovery_index.js", [
  "msg",
  "node",
  "global",
  "flow",
]);
const buildSnapshot = compile("entity_map_snapshot.js", [
  "msg",
  "node",
  "global",
  "flow",
  "context",
]);
const prepareRegistry = compile("entity_map_prepare.js", [
  "msg",
  "node",
  "global",
  "flow",
]);
const prepareStates = compile("entity_map_prepare_states.js", [
  "msg",
  "node",
  "global",
  "flow",
  "env",
]);

function context() {
  const values = new Map();
  return {
    get(key) {
      return values.get(key);
    },
    set(key, value) {
      values.set(key, value);
    },
  };
}

function nodeStub() {
  return {
    statuses: [],
    errors: [],
    status(value) {
      this.statuses.push(value);
    },
    error(message) {
      this.errors.push(String(message));
    },
  };
}

function discoveryMessage(component, uniqueId, name = uniqueId) {
  return {
    topic: `homeassistant/${component}/${uniqueId}/config`,
    payload: {
      name,
      unique_id: uniqueId,
      default_entity_id: `${component}.${uniqueId}`,
      state_topic: `homeassistant/${component}/${uniqueId}/state`,
      command_topic: `homeassistant/${component}/${uniqueId}/set`,
    },
  };
}

function addDiscovery(global, component, uniqueId, name) {
  const node = nodeStub();
  const output = indexDiscovery(
    discoveryMessage(component, uniqueId, name),
    node,
    global,
    context(),
  );
  assert.deepEqual(node.errors, []);
  assert.equal(output.topic, "entity-map-refresh");
  return output;
}

function snapshot(global, registry, states, local = context()) {
  const node = nodeStub();
  const output = buildSnapshot(
    {
      entityRegistry: registry,
      payload: states,
    },
    node,
    global,
    context(),
    local,
  );
  assert.deepEqual(node.errors, []);
  return output;
}

const families = [
  ["light", "switch_9", "DC_DIMMER_STATUS_3", "1FEDA"],
  ["light", "switch_l_4", "DC_LOAD_STATUS", "1FFBD"],
  ["light", "switch_ac_5", "AC_LOAD_STATUS", "1FFBF"],
  ["light", "switch_i_6", "GENERIC_INDICATOR_STATUS", "1FED7"],
  ["cover", "shade_2", "WINDOW_SHADE_CONTROL_STATUS", "1FEDE"],
  ["lock", "lock_1", "LOCK_STATUS", "1FEE5"],
  ["climate", "thermostat_zone_2", "THERMOSTAT_STATUS_1", "1FFE2"],
  ["sensor", "thermostat_ambient_zone2", "THERMOSTAT_AMBIENT_STATUS", "1FF9C"],
  ["sensor", "tank_fresh", "TANK_STATUS", "1FFB7"],
  ["sensor", "battery_house", "DC_SOURCE_STATUS_1", "1FFFD"],
  ["switch", "water_pump", "WATER_PUMP_STATUS", "1FFB3"],
  ["switch", "autofill", "AUTOFILL_STATUS", "1FFB1"],
  ["climate", "floor_heat_3", "FLOOR_HEAT_STATUS", "1FEFC"],
  ["light", "aquahot_burner", "SILVERLEAF_AQUAHOT_STATUS", null],
  ["light", "aquahot_ac_1", "SILVERLEAF_AQUAHOT_STATUS", null],
  ["light", "aquahot_ac_2", "SILVERLEAF_AQUAHOT_STATUS", null],
  ["light", "aquahot_engine", "SILVERLEAF_AQUAHOT_STATUS", null],
];

test("startup and registry events rebuild one debounced retained snapshot", () => {
  const yaml = fs.readFileSync(
    path.join(__dirname, "..", "src", "tabs", "config.yaml"),
    "utf8",
  );

  assert.match(yaml, /name: Entity map on deploy[\s\S]*?once: true/);
  assert.match(yaml, /eventType: home_assistant_client/);
  assert.match(yaml, /eventType: entity_registry_updated/);
  assert.match(
    yaml,
    /name: Debounce entity map refresh[\s\S]*?duration: "2"[\s\S]*?extend: true/,
  );
  assert.match(yaml, /id: entity_map_snapshot[\s\S]*?entity_map_retain_link/);

  const manifest = JSON.parse(
    fs.readFileSync(path.join(configDir, ".manifest.json"), "utf8"),
  );
  for (const id of [
    "entity_map_ready",
    "entity_map_prepare",
    "entity_map_prepare_states",
    "entity_map_snapshot",
  ]) {
    assert.equal(manifest[id].hasCode, true);
  }
});

test("snapshot joins stable unique ID to renamed entity ID and current name", () => {
  const global = context();
  addDiscovery(global, "light", "switch_9", "Patio Light");

  const output = snapshot(
    global,
    [
      {
        unique_id: "switch_9",
        entity_id: "light.renamed_lounge",
        name: "Owner Registry Name",
      },
    ],
    [
      {
        entity_id: "light.renamed_lounge",
        attributes: { friendly_name: "Reading Nook" },
      },
    ],
  );

  assert.equal(output.topic, "rvc/entity-map");
  assert.equal(output.qos, 1);
  assert.equal(output.retain, true);
  assert.equal(output.payload.schema_version, 1);
  assert.equal(output.payload.source.authority, "librecoach-node-red");
  assert.equal(output.payload.entities.length, 1);
  assert.deepEqual(output.payload.entities[0], {
    entity_id: "light.renamed_lounge",
    friendly_name: "Reading Nook",
    name_source: "owner-customized",
    unique_id: "switch_9",
    object_id: "switch_9",
    original_name: "Patio Light",
    component: "light",
    state_bindings: output.payload.entities[0].state_bindings,
    command_bindings: output.payload.entities[0].command_bindings,
    bindings: output.payload.entities[0].bindings,
    binding_authority: "librecoach-node-red entity publishers",
  });
  assert.equal(
    output.payload.entities[0].state_bindings[0].decoder_key,
    "DC_DIMMER_STATUS_3",
  );
});

test("complete snapshot replacement removes deleted discovery entities", () => {
  const global = context();
  addDiscovery(global, "switch", "water_pump", "Water Pump");
  const registry = [
    {
      unique_id: "water_pump",
      entity_id: "switch.water_pump",
      name: null,
    },
  ];
  const states = [
    {
      entity_id: "switch.water_pump",
      attributes: { friendly_name: "Water Pump" },
    },
  ];

  assert.equal(snapshot(global, registry, states).payload.entities.length, 1);
  const removed = indexDiscovery(
    {
      topic: "homeassistant/switch/water_pump/config",
      payload: "",
    },
    nodeStub(),
    global,
    context(),
  );
  assert.equal(removed.payload.reason, "discovery-removed");
  assert.deepEqual(snapshot(global, registry, states).payload.entities, []);
});

test("unchanged discovery and snapshot inputs do not republish", () => {
  const global = context();
  const local = context();
  const firstDiscovery = addDiscovery(
    global,
    "switch",
    "water_pump",
    "Water Pump",
  );
  assert.equal(firstDiscovery.payload.reason, "discovery-updated");

  const duplicateNode = nodeStub();
  const duplicateDiscovery = indexDiscovery(
    discoveryMessage("switch", "water_pump", "Water Pump"),
    duplicateNode,
    global,
    context(),
  );
  assert.equal(duplicateDiscovery, null);
  assert.match(duplicateNode.statuses.at(-1).text, /unchanged/);

  const changedDiscovery = indexDiscovery(
    discoveryMessage("switch", "water_pump", "Fresh Water Pump"),
    nodeStub(),
    global,
    context(),
  );
  assert.equal(changedDiscovery.payload.reason, "discovery-updated");

  const registry = [
    {
      unique_id: "water_pump",
      entity_id: "switch.water_pump",
      name: null,
    },
  ];
  const states = [
    {
      entity_id: "switch.water_pump",
      attributes: { friendly_name: "Water Pump" },
    },
  ];
  assert.ok(snapshot(global, registry, states, local));
  assert.equal(snapshot(global, registry, states, local), null);

  states[0].attributes.friendly_name = "Fresh Water Pump";
  const renamed = snapshot(global, registry, states, local);
  assert.equal(renamed.payload.entities[0].friendly_name, "Fresh Water Pump");
});

test("all supported entity families carry explicit protocol bindings", () => {
  const global = context();
  for (const [component, uniqueId] of families) {
    addDiscovery(global, component, uniqueId, `Default ${uniqueId}`);
  }
  const registry = families.map(([component, uniqueId]) => ({
    unique_id: uniqueId,
    entity_id: `${component}.${uniqueId}`,
    name: null,
  }));
  const states = families.map(([component, uniqueId]) => ({
    entity_id: `${component}.${uniqueId}`,
    attributes: { friendly_name: `Default ${uniqueId}` },
  }));
  const output = snapshot(global, registry, states);

  assert.equal(output.payload.entities.length, families.length);
  for (const [, uniqueId, decoderKey, dgn] of families) {
    const entity = output.payload.entities.find(
      (candidate) => candidate.unique_id === uniqueId,
    );
    assert.ok(entity.bindings.length > 0, uniqueId);
    assert.equal(entity.name_source, "librecoach-default", uniqueId);
    assert.equal(entity.friendly_name, `Default ${uniqueId}`, uniqueId);
    const state = entity.bindings.find((binding) => binding.role === "state");
    assert.equal(state.decoder_key, decoderKey, uniqueId);
    if (dgn) assert.equal(state.dgn, dgn, uniqueId);
    for (const command of entity.bindings.filter(
      (binding) => binding.role === "command",
    )) {
      assert.equal(command.descriptive_only, true, uniqueId);
    }
  }

  const dimmer = output.payload.entities.find(
    (entity) => entity.unique_id === "switch_9",
  );
  assert.ok(
    dimmer.bindings.some(
      (binding) => binding.decoder_key === "DC_COMPONENT_DRIVER_STATUS_1",
    ),
  );
  assert.ok(
    dimmer.bindings.some(
      (binding) => binding.decoder_key === "DC_COMPONENT_DRIVER_STATUS_6",
    ),
  );
  assert.ok(
    dimmer.bindings.some(
      (binding) =>
        binding.decoder_key === "DC_COMPONENT_DRIVER_COMMAND" &&
        binding.descriptive_only === true,
    ),
  );
});

test("command-only indicator groups and unsupported panel sensors stay explicit", () => {
  const global = context();
  addDiscovery(global, "light", "switch_g_3", "Indicator Group 3");
  addDiscovery(global, "sensor", "panel_4_signal_strength", "Panel Signal");
  const output = snapshot(
    global,
    [
      {
        unique_id: "switch_g_3",
        entity_id: "light.switch_g_3",
        name: null,
      },
      {
        unique_id: "panel_4_signal_strength",
        entity_id: "sensor.panel_4_signal_strength",
        name: null,
      },
    ],
    [
      {
        entity_id: "light.switch_g_3",
        attributes: { friendly_name: "Indicator Group 3" },
      },
      {
        entity_id: "sensor.panel_4_signal_strength",
        attributes: { friendly_name: "Panel Signal" },
      },
    ],
  );

  const group = output.payload.entities.find(
    (entity) => entity.unique_id === "switch_g_3",
  );
  assert.equal(group.bindings.length, 1);
  assert.equal(group.bindings[0].role, "command");
  assert.equal(group.bindings[0].descriptive_only, true);
  assert.equal(group.bindings[0].selector.semantic, "indicator-group");

  const panel = output.payload.entities.find(
    (entity) => entity.unique_id === "panel_4_signal_strength",
  );
  assert.deepEqual(panel.bindings, []);
});

test("Aqua-Hot metadata preserves projections and TM2xx identity", () => {
  const global = context();
  for (const uniqueId of [
    "aquahot_burner",
    "aquahot_ac_1",
    "aquahot_ac_2",
    "aquahot_engine",
  ]) {
    addDiscovery(global, "light", uniqueId, uniqueId);
  }
  const output = snapshot(
    global,
    ["aquahot_burner", "aquahot_ac_1", "aquahot_ac_2", "aquahot_engine"].map(
      (uniqueId) => ({
        unique_id: uniqueId,
        entity_id: `light.${uniqueId}`,
        name: null,
      }),
    ),
    ["aquahot_burner", "aquahot_ac_1", "aquahot_ac_2", "aquahot_engine"].map(
      (uniqueId) => ({
        entity_id: `light.${uniqueId}`,
        attributes: { friendly_name: uniqueId },
      }),
    ),
  );
  const entities = new Map(
    output.payload.entities.map((entity) => [entity.unique_id, entity]),
  );

  assert.equal(
    entities.get("aquahot_ac_1").state_bindings[0].projection.value,
    "AC 1",
  );
  assert.equal(
    entities.get("aquahot_ac_2").state_bindings[0].projection.value,
    "AC 2",
  );
  assert.equal(
    entities.get("aquahot_burner").state_bindings[0].projection.field,
    "diesel_burner",
  );
  assert.equal(
    entities.get("aquahot_engine").state_bindings[0].projection.field,
    "engine_preheat",
  );
  for (const entity of entities.values()) {
    const state = entity.state_bindings[0];
    assert.equal(state.operation, 0xa9);
    assert.deepEqual(state.product_family.models, [
      "TM220",
      "TM225",
      "TM226",
      "TM229",
    ]);
    assert.ok(state.projection.unavailable.includes("Reserved"));
    assert.ok(state.projection.unavailable.includes("Not Available"));
    assert.equal(entity.command_bindings[0].operation, 0xab);
    assert.equal(entity.command_bindings[0].descriptive_only, true);
  }
});

test("snapshot payload excludes authentication and address data", () => {
  const global = context();
  addDiscovery(global, "switch", "autofill", "Auto Fill");
  const output = snapshot(
    global,
    [
      {
        unique_id: "autofill",
        entity_id: "switch.autofill",
        name: null,
      },
    ],
    [
      {
        entity_id: "switch.autofill",
        attributes: { friendly_name: "Auto Fill" },
      },
    ],
  );
  const serialized = JSON.stringify(output.payload);

  assert.doesNotMatch(
    serialized,
    /SUPERVISOR_TOKEN|Bearer|password|credential|source_address|destination_address/i,
  );
  const state = output.payload.entities[0].state_bindings[0];
  assert.ok(state.projection.unavailable.includes("Reserved"));
  assert.ok(state.projection.unavailable.includes("Not Available"));
});

test("registry and state fetches reuse existing Home Assistant access", () => {
  const registryRequest = prepareRegistry({}, nodeStub(), context(), context());
  assert.equal(
    registryRequest.payload.data.type,
    "config/entity_registry/list",
  );

  const stateRequest = prepareStates(
    {
      payload: [{ unique_id: "switch_9" }],
    },
    nodeStub(),
    context(),
    context(),
    {
      get(key) {
        return key === "SUPERVISOR_TOKEN" ? "test-token" : undefined;
      },
    },
  );
  assert.equal(stateRequest.url, "http://supervisor/core/api/states");
  assert.equal(stateRequest.headers.Authorization, "Bearer test-token");
  assert.deepEqual(stateRequest.entityRegistry, [
    {
      unique_id: "switch_9",
    },
  ]);
});
