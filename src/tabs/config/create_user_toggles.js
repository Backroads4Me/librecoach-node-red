// Creates LibreCoach: System config toggles via MQTT Discovery

const device = {
  identifiers: ["librecoach-system"],
  name: "LibreCoach: System",
  manufacturer: "LibreCoach",
};

const messages = [];

// === Import/Export & RV Info ===

// Export Configuration button
messages.push({
  topic: "homeassistant/button/librecoach_export_config/config",
  payload: {
    name: "Export LibreCoach Configuration",
    unique_id: "librecoach_export_config",
    default_entity_id: "button.librecoach_export_config",
    icon: "mdi:download",
    command_topic: "librecoach/export/trigger",
    device: device,
  },
});

// Import Configuration button
messages.push({
  topic: "homeassistant/button/librecoach_import_config/config",
  payload: {
    name: "Import LibreCoach Configuration",
    unique_id: "librecoach_import_config",
    default_entity_id: "button.librecoach_import_config",
    icon: "mdi:upload",
    command_topic: "librecoach/import/trigger",
    device: device,
  },
});

// RV Info fields
const rvFields = [
  {
    id: "rv_manufacturer",
    name: "RV Manufacturer",
    icon: "mdi:factory",
    max: 50,
  },
  { id: "rv_model", name: "RV Model", icon: "mdi:rv-truck", max: 50 },
  { id: "rv_year", name: "RV Year", icon: "mdi:calendar", max: 4 },
  { id: "rv_other", name: "RV Other", icon: "mdi:note-text", max: 100 },
];

for (const field of rvFields) {
  // Config
  messages.push({
    topic: `homeassistant/text/${field.id}/config`,
    payload: {
      name: field.name,
      unique_id: field.id,
      default_entity_id: `text.${field.id}`,
      icon: field.icon,
      state_topic: `librecoach/rv_info/${field.id}`,
      command_topic: `librecoach/rv_info/${field.id}/set`,
      max: field.max,
      device: device,
    },
  });

  // State (restore from global or empty string)
  const storedValue = global.get(field.id, "file") || "";
  messages.push({
    topic: `librecoach/rv_info/${field.id}`,
    payload: storedValue,
    retain: true,
  });
}

// === Unknown CAN Recording ===

// Switch - Record Unknown CAN
messages.push({
  topic: "homeassistant/switch/librecoach_record_unknown/config",
  payload: {
    name: "Tools: Record Unknown Commands",
    unique_id: "librecoach_record_unknown",
    default_entity_id: "switch.librecoach_record_unknown",
    icon: "mdi:record-rec",
    command_topic: "librecoach/record_unknown/set",
    state_topic: "homeassistant/switch/librecoach_record_unknown/state",
    payload_on: "1",
    payload_off: "0",
    state_on: "ON",
    state_off: "OFF",
    optimistic: false,
    value_template: "{{ 'ON' if value == '1' else 'OFF' }}",
    device: device,
  },
});

// State - Record Unknown CAN default off
global.set("recordUnknown", false, "file");
messages.push({
  topic: "homeassistant/switch/librecoach_record_unknown/state",
  payload: 0,
  retain: true,
});

// Export AI Dashboard Prompt button
messages.push({
  topic: "homeassistant/button/librecoach_export_entities/config",
  payload: {
    name: "Export AI Dashboard Prompt",
    unique_id: "librecoach_export_entities",
    default_entity_id: "button.librecoach_export_entities",
    icon: "mdi:robot-outline",
    command_topic: "librecoach/export/entities/trigger",
    device: device,
  },
});

// Button - Export Unknown Recording
messages.push({
  topic: "homeassistant/button/librecoach_export_unknown/config",
  payload: {
    name: "Tools: Save Recorded Log",
    unique_id: "librecoach_export_unknown",
    default_entity_id: "button.librecoach_export_unknown",
    icon: "mdi:download",
    command_topic: "librecoach/export/unknown/trigger",
    device: device,
  },
});

// === Cleanup Old Entities ===
// Send empty payload to delete orphaned entities from Home Assistant

const cleanupTopics = [
  "homeassistant/switch/victron_integration/config",
  "homeassistant/switch/librecoach_testing_beta/config",
  "homeassistant/switch/librecoach_beta_testing/config",
];

for (const topic of cleanupTopics) {
  messages.push({ topic: topic, payload: "" });
}

node.status({
  fill: "green",
  shape: "dot",
  text: `System Entities Created`,
});

return [messages];
