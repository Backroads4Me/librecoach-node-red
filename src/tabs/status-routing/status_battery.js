// HA Status Publisher for Battery (DC_SOURCE_STATUS, §6.22)
// Self-creating: publishes MQTT discovery on first valid reading per instance.
// Output 1: MQTT messages (discovery + state)

if (!msg.payload || typeof msg.payload !== "object") {
  return null;
}

const p = msg.payload;
const instance = p.instance;

if (typeof instance !== "number" || instance < 0 || instance > 250) {
  return null;
}

const voltage = p.dc_voltage_V;

if (typeof voltage !== "number") {
  return null;
}

// Instance-to-suffix map (per RV-C spec §6.22)
const batteryMap = {
  1: { suffix: "house", name: "Main House Battery" },
  2: { suffix: "chassis", name: "Chassis Battery" },
  3: { suffix: "house2", name: "Secondary House Battery" },
  4: { suffix: "generator", name: "Generator Battery" },
};

let entitySuffix, displayName;
if (instance >= 5 && instance <= 250) {
  entitySuffix = instance.toString();
  displayName = `Battery ${instance}`;
} else {
  const info = batteryMap[instance] || {
    suffix: instance.toString(),
    name: `Unknown Battery ${instance}`,
  };
  entitySuffix = info.suffix;
  displayName = info.name;
}

const entityId = `battery_${entitySuffix}`;
const componentType = "sensor";
const stateTopic = `homeassistant/${componentType}/${entityId}/state`;

// Round voltage to 2 decimal places, clamp to reasonable range
const v = Math.max(0, Math.min(50, Math.round(voltage * 100) / 100));

const messages = [];

// Self-creating discovery: publish config on first valid reading
const CREATED_KEY = "batteryCreated";
const created = flow.get(CREATED_KEY) || {};

if (!created[instance]) {
  messages.push({
    topic: `homeassistant/${componentType}/${entityId}/config`,
    payload: {
      name: displayName,
      unique_id: entityId,
      default_entity_id: `sensor.${entityId}`,
      icon: "mdi:car-battery",
      state_topic: stateTopic,
      unit_of_measurement: "V",
      device_class: "voltage",
      value_template: "{{ value | float | round(2) }}",
      device: {
        identifiers: ["librecoach-energy"],
        name: "Energy",
        manufacturer: "LibreCoach",
      },
    },
  });

  created[instance] = true;
  flow.set(CREATED_KEY, created);
}

// State update
messages.push({
  topic: stateTopic,
  payload: v,
});

return [messages];
