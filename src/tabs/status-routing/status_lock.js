// HA Status Publisher for Lock (LOCK_STATUS, 1FEE5, §6.40)
// Self-creating: publishes MQTT discovery on first valid reading per instance.
// Also bootstraps instance 0 ("All Locks") broadcast entity on first message.
// Output 1: MQTT messages (discovery + state)

if (!msg.payload || typeof msg.payload !== "object") {
  return null;
}

const p = msg.payload;
const instance = p.instance;

if (typeof instance !== "number" || instance < 0 || instance > 250) {
  return null;
}

// Determine lock state from decoder output
let haStatus;
if (p.is_locked === true) {
  haStatus = "LOCKED";
} else if (p.is_unlocked === true) {
  haStatus = "UNLOCKED";
} else if (typeof p.lock_status === "string") {
  const s = p.lock_status.toLowerCase();
  if (s.includes("locked") && !s.includes("unlocked")) {
    haStatus = "LOCKED";
  } else if (s.includes("unlocked")) {
    haStatus = "UNLOCKED";
  }
}

// Require a valid lock state before creating entities
if (!haStatus) {
  return null;
}

const componentType = "lock";
const messages = [];

const CREATED_KEY = "lockCreated";
const created = flow.get(CREATED_KEY) || {};

// Bootstrap instance 0 ("All Locks") on first lock message
if (!created[0]) {
  const entityId0 = "lock_0";
  messages.push({
    topic: `homeassistant/${componentType}/${entityId0}/config`,
    payload: {
      name: "All Locks",
      unique_id: entityId0,
      default_entity_id: `${componentType}.${entityId0}`,
      icon: "mdi:lock",
      command_topic: `homeassistant/${componentType}/${entityId0}/set`,
      state_topic: `homeassistant/${componentType}/${entityId0}/state`,
      payload_lock: "LOCK",
      payload_unlock: "UNLOCK",
      state_locked: "LOCKED",
      state_unlocked: "UNLOCKED",
      optimistic: true,
      availability_mode: "all",
      availability: [
        { topic: "librecoach/nodered/status", payload_available: "online", payload_not_available: "offline" },
        { topic: "can/status", value_template: "{{ 'online' if value == 'online' else 'offline' }}", payload_available: "online", payload_not_available: "offline" },
      ],
      device: {
        identifiers: ["librecoach-locks"],
        name: "Locks",
        manufacturer: "LibreCoach",
      },
    },
  });

  created[0] = true;
  flow.set(CREATED_KEY, created);
}

// Skip state publishing for instance 0 (broadcast-only, optimistic)
if (instance === 0) {
  return messages.length > 0 ? [messages] : null;
}

// Self-creating discovery for individual locks
const entityId = `lock_${instance}`;
const stateTopic = `homeassistant/${componentType}/${entityId}/state`;

if (!created[instance]) {
  messages.push({
    topic: `homeassistant/${componentType}/${entityId}/config`,
    payload: {
      name: `Lock ${instance}`,
      unique_id: entityId,
      default_entity_id: `${componentType}.${entityId}`,
      icon: "mdi:lock",
      command_topic: `homeassistant/${componentType}/${entityId}/set`,
      state_topic: stateTopic,
      payload_lock: "LOCK",
      payload_unlock: "UNLOCK",
      state_locked: "LOCKED",
      state_unlocked: "UNLOCKED",
      optimistic: false,
      availability_mode: "all",
      availability: [
        { topic: "librecoach/nodered/status", payload_available: "online", payload_not_available: "offline" },
        { topic: "can/status", value_template: "{{ 'online' if value == 'online' else 'offline' }}", payload_available: "online", payload_not_available: "offline" },
      ],
      device: {
        identifiers: ["librecoach-locks"],
        name: "Locks",
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
  payload: haStatus,
});

return [messages];
