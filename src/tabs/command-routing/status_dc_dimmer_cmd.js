// HA Status Publisher for DC Dimmer — inferred from COMMAND_2 (DGN 1FEDBh)
// Self-creating: publishes MQTT discovery on first valid command per instance.
// Uses switch_N entity naming (same as STATUS_3 path).
// Output 1: MQTT messages [messages] (discovery + state)

if (!msg.payload || typeof msg.payload !== "object") {
  return null;
}

const p = msg.payload;
const instance = p.instance;
const commandRaw = p.command_raw;
const levelRaw = p.desired_level_raw;

if (typeof instance !== "number" || instance < 1 || instance > 250) {
  return null;
}

// This node is only a fallback for RVs that never acknowledge light changes
// with DC_DIMMER_STATUS_* messages. Once real status is seen for an instance,
// let the status-based publisher own discovery and state permanently.
const statusBackedInstances =
  global.get("dcDimmerStatusBackedInstances", "file") || [];
if (statusBackedInstances.includes(instance)) {
  return null;
}

if (typeof commandRaw !== "number") {
  return null;
}

// --- Command-to-state mapping ---
// Returns: "ON", "OFF", or null (ignore / no state change)
function inferState(cmd, level) {
  switch (cmd) {
    case 0x01: // On Duration
    case 0x02: // On Delay
      return "ON";
    case 0x05: // Toggle — assume ON (can't know current state)
      return "ON";
    case 0x03: // Off Delay
    case 0x06: // Memory Off
      return "OFF";
    case 0x00: // Set Level
    case 0x0b: // Ramp Brightness
      if (typeof level === "number") {
        return level > 0 ? "ON" : "OFF";
      }
      return null;
    default:
      // Stop (0x04), Save Scene (0x07), Ramp Up (0x0D), Ramp Down (0x0E),
      // Ramp Up/Down (0x0F/0x15), Lock (0x21), Unlock (0x22),
      // Flash (0x1F), Flash Momentary (0x20), Ramp Toggle (0x0C/0x10)
      return null;
  }
}

const haStatus = inferState(commandRaw, levelRaw);

if (haStatus === null) {
  return null;
}

// --- Dimmable detection ---
const dimmableLights = global.get("dimmableLights", "file") || [];
let isDimmable = dimmableLights.includes(instance);

function markDimmable() {
  if (!isDimmable) {
    dimmableLights.push(instance);
    global.set("dimmableLights", dimmableLights, "file");
    isDimmable = true;
  }
}

// Intermediate levels (1-199 raw = 0.5%-99.5%) indicate dimmable
if (typeof levelRaw === "number" && levelRaw >= 1 && levelRaw <= 199) {
  markDimmable();
}

// Ramp commands indicate dimmable regardless of level
const rampCommands = [0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x15];
if (rampCommands.includes(commandRaw)) {
  markDimmable();
}

// --- Brightness from COMMAND_2 ---
let brightness;
if (typeof levelRaw === "number" && levelRaw <= 200) {
  // 0-200 raw → 0-100%
  brightness = parseFloat((levelRaw * 0.5).toFixed(1));
}
// Special values (250=Dimmed Memory, 251=Master Memory, scenes) → no brightness
// (actual level unknown — report ON without brightness)

// --- Entity identifiers — switch_N (same as STATUS_3 path) ---
const entityId = `switch_${instance}`;
const entityName = `Switch ${instance}`;
const stateTopic = `homeassistant/light/${entityId}/state`;
const commandTopic = `homeassistant/light/${entityId}/set`;

const messages = [];

// Capability is persisted in the FILE store (shared key with the status path,
// status_dc_dimmer_3.js) so discovery runs only on a genuine capability change
// rather than on every restart, and so the two paths never fight over switch_N.
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

// --- Store last brightness for dimmable recall on toggle ---
if (isDimmable && typeof brightness === "number" && brightness > 0) {
  global.set("dimmerBrightness_" + instance, brightness, "file");
}

// --- Build JSON state payload ---
const stateObj = { state: haStatus };

if (haStatus === "ON") {
  if (isDimmable) {
    stateObj.color_mode = "brightness";
    if (brightness !== undefined && brightness > 0) {
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
