// HA Status Publisher for DC Dimmer (STATUS_3 1FEDAh §6.23.6 + STATUS_1 1FFBBh §6.23.3)
// Self-creating: publishes MQTT discovery on first valid reading per instance.
// Output 1: MQTT messages (discovery + state)
// Entity naming: switch_N (routing key "switch"), "Switches" device.

if (!msg.payload || typeof msg.payload !== "object") {
  return null;
}

const p = msg.payload;
const instance = p.instance;

if (typeof instance !== "number" || instance < 1 || instance > 250) {
  return null;
}

// Track instances that report real dimmer status so command-inferred fallback
// can be disabled for those lights after the first acknowledgement.
const statusBackedInstances =
  global.get("dcDimmerStatusBackedInstances", "file") || [];
if (!statusBackedInstances.includes(instance)) {
  statusBackedInstances.push(instance);
  global.set("dcDimmerStatusBackedInstances", statusBackedInstances, "file");
}

// Dimmable detection
const dimmableLights = global.get("dimmableLights", "file") || [];
let isDimmable = dimmableLights.includes(instance);

function markDimmable() {
  if (!isDimmable) {
    dimmableLights.push(instance);
    global.set("dimmableLights", dimmableLights, "file");
    isDimmable = true;
  }
}

let haStatus;
let brightness;

if (p.master_brightness !== undefined) {
  // STATUS_1 message: has master_brightness (0-100%)
  brightness = p.master_brightness;
  haStatus = brightness > 0 ? "ON" : "OFF";

  if (brightness > 0 && brightness < 100) {
    markDimmable();
  }
} else if (typeof p.load_status === "string") {
  // STATUS_3 message: has load_status and operating_status
  haStatus = p.load_status.includes("Off") ? "OFF" : "ON";

  const opStatus = p.operating_status;

  if (opStatus === "Value Changing (Ramp)") {
    markDimmable();
  } else if (typeof opStatus === "number" && opStatus > 0 && opStatus < 100) {
    markDimmable();
  }

  if (isDimmable && typeof opStatus === "number") {
    brightness = opStatus;
  }
} else {
  return null;
}

const entityId = `switch_${instance}`;
const stateTopic = `homeassistant/light/${entityId}/state`;
const commandTopic = `homeassistant/light/${entityId}/set`;

const messages = [];

// Self-creating discovery: (re)publish whenever advertised capability differs
// from last published — self-corrects after any context/broker desync.
const CREATED_KEY = "dcDimmerCreated";
const created = flow.get(CREATED_KEY) || {};
const desiredMode = isDimmable ? "brightness" : "onoff";

if (created[instance] !== desiredMode) {
  // HA won't hot-swap supported_color_modes on an already-registered entity
  // (a later discovery claiming ["brightness"] is silently ignored). When the
  // capability changes, first publish an empty retained payload to remove the
  // entity, then republish so HA recreates it fresh with the new capability.
  if (created[instance] !== undefined) {
    messages.push({
      topic: `homeassistant/light/${entityId}/config`,
      payload: "",
    });
  }

  const config = {
    name: `Switch ${instance}`,
    unique_id: entityId,
    default_entity_id: `light.${entityId}`,
    icon: "mdi:light-recessed",
    schema: "json",
    command_topic: commandTopic,
    state_topic: stateTopic,
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

  created[instance] = desiredMode;
  flow.set(CREATED_KEY, created);
}

// Store last brightness for dimmable recall on toggle
if (isDimmable && typeof brightness === "number" && brightness > 0) {
  global.set("dimmerBrightness_" + instance, brightness, "file");
}

// Build JSON state payload
const stateObj = { state: haStatus };

if (haStatus === "ON") {
  if (isDimmable) {
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
