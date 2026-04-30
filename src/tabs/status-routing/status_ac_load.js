// HA Status Publisher for AC Load (DGN 1FFBFh, §6.22.2)
// Self-creating: publishes MQTT discovery on first valid reading per instance.
// Output 1: MQTT messages (discovery + state)
// Entity naming: switch_ac_N (routing key "switch_a"), "Switches" device.

if (!msg.payload || typeof msg.payload !== "object") {
  return null;
}

const p = msg.payload;
const instance = p.instance;

if (typeof instance !== "number" || instance < 1 || instance > 250) {
  return null;
}

const opLevel = p.operating_level;
if (opLevel === undefined || opLevel === "Not Available") {
  return null;
}

// Dimmable detection
const dimmableAcLoads = global.get("dimmableAcLoads", "file") || [];
let isDimmable = dimmableAcLoads.includes(instance);
let needsRecreate = false;

function markDimmable() {
  if (!isDimmable) {
    dimmableAcLoads.push(instance);
    global.set("dimmableAcLoads", dimmableAcLoads, "file");
    isDimmable = true;
    needsRecreate = true;
  }
}

// Detect dimmable via spec bit
if (p.is_dimmable === true) {
  markDimmable();
}

// Determine state and brightness
let haStatus;
let brightness;

if (typeof opLevel === "number") {
  haStatus = opLevel > 0 ? "ON" : "OFF";
  brightness = opLevel;

  // Detect dimmable via operating level range (1-99%)
  if (opLevel > 0 && opLevel < 100) {
    markDimmable();
  }
} else if (opLevel === "Load Delay Active") {
  haStatus = "ON";
} else {
  return null;
}

// Entity identifiers — switch_ac_N distinguishes from DC_DIMMER and DC_LOAD
const entityId = `switch_ac_${instance}`;
const stateTopic = `homeassistant/light/${entityId}/state`;
const commandTopic = `homeassistant/light/${entityId}/set`;

const messages = [];

// Self-creating discovery: publish config on first valid reading
const CREATED_KEY = "acLoadCreated";
const created = flow.get(CREATED_KEY) || {};

if (!created[instance] || needsRecreate) {
  const config = {
    name: `AC Load ${instance}`,
    unique_id: entityId,
    default_entity_id: `light.${entityId}`,
    icon: "mdi:power-plug",
    schema: "json",
    command_topic: commandTopic,
    state_topic: stateTopic,
    device: {
      identifiers: ["librecoach-switches"],
      name: "Switches",
      manufacturer: "LibreCoach",
    },
  };

  if (isDimmable) {
    config.brightness = true;
    config.brightness_scale = 100;
    config.supported_color_modes = ["brightness"];
  } else {
    config.supported_color_modes = ["onoff"];
  }

  messages.push({
    topic: `homeassistant/light/${entityId}/config`,
    payload: config,
  });

  created[instance] = true;
  flow.set(CREATED_KEY, created);
}

// Store last brightness for dimmable recall on toggle
if (isDimmable && typeof brightness === "number" && brightness > 0) {
  global.set("acLoadBrightness_" + instance, brightness, "file");
}

// Build JSON state payload
const stateObj = { state: haStatus };

if (haStatus === "ON") {
  if (isDimmable && !needsRecreate) {
    stateObj.color_mode = "brightness";
    if (brightness !== undefined) {
      stateObj.brightness = brightness;
    }
  } else {
    stateObj.color_mode = "onoff";
  }
}

messages.push({
  topic: stateTopic,
  payload: JSON.stringify(stateObj),
});

return [messages];
