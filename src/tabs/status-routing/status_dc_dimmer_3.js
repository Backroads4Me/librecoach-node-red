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
const entityName = `Switch ${instance}`;
const stateTopic = `homeassistant/light/${entityId}/state`;
const commandTopic = `homeassistant/light/${entityId}/set`;

const messages = [];

// The published capability is persisted per instance in the FILE store so it
// survives Node-RED restarts: discovery then runs only on a genuine capability
// change, never on every boot, so a normal restart touches nothing in HA (the
// retained config already in the broker is correct). Shared with the command
// path (status_dc_dimmer_cmd.js -> same key) so the two never fight over
// switch_N. This also neutralizes the dimmableLights file-store load race at
// startup, where the first message can briefly read isDimmable === false.
const PUBLISHED_KEY = "dcDimmerPublishedMode";
const publishedModes = global.get(PUBLISHED_KEY, "file") || {};
const priorMode = publishedModes[instance];

// ============================================================================
// SHARED BLOCK: light discovery publish (delete-then-recreate on mode change)
// Identical copies in: status_dc_dimmer_3.js (status-routing),
//   status_dc_dimmer_cmd.js (command-routing), status_dc_driver.js
//   (status-routing) — edit all three together, keep byte-identical.
//
// HA won't hot-swap supported_color_modes on an existing entity (a later
// discovery claiming ["brightness"] is silently ignored), so an
// onoff -> brightness change requires delete-then-recreate. Dimmability is
// monotonic — a light only ever proves it CAN dim, absence of a dim reading
// is not proof it can't — so we never downgrade brightness -> onoff.
//
// Inputs:  entityId, entityName, stateTopic, commandTopic, isDimmable (let),
//          priorMode, messages[]
// Outputs: sets desiredMode (persist it after the block on change); may
//          upgrade isDimmable; pushes discovery messages onto messages[]
// ============================================================================
const desiredMode =
  isDimmable || priorMode === "brightness" ? "brightness" : "onoff";

// Keep isDimmable aligned with the capability we will actually publish so the
// state payload advertises the matching color_mode.
if (desiredMode === "brightness") {
  isDimmable = true;
}

if (priorMode !== desiredMode) {
  // Remove any existing retained config first, then republish so HA recreates
  // the entity fresh with the new capability. Unconditional within this block:
  // it heals an already-registered entity stuck on the wrong mode (priorMode
  // may be undefined on the first deploy even though HA has a stale entity).
  // Removing a non-existent/unretained config is a harmless no-op.
  messages.push({
    topic: `homeassistant/light/${entityId}/config`,
    payload: "",
  });

  const config = {
    name: entityName,
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
}
// ==================== END SHARED BLOCK: light discovery ====================

if (priorMode !== desiredMode) {
  publishedModes[instance] = desiredMode;
  global.set(PUBLISHED_KEY, publishedModes, "file");
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
  payload: stateObj,
});

return [messages];
