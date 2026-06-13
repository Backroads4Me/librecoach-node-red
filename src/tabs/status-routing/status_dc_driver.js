// HA Status Publisher for DC Component Driver (Lights representation)

const payload = msg.payload;

if (
  !payload ||
  !payload.dgn_name ||
  !payload.dgn_name.startsWith("DC_COMPONENT_DRIVER_STATUS_")
) {
  return null;
}

const driver_index = payload.driver_index;
if (driver_index === undefined) return null;

// Use flow context for discovery check
let knownDrivers = flow.get("knownDcDrivers");
if (!knownDrivers) {
  knownDrivers = {};
}

// We need either STATUS_1 or STATUS_6 to do something useful
if (
  payload.dgn_name !== "DC_COMPONENT_DRIVER_STATUS_1" &&
  payload.dgn_name !== "DC_COMPONENT_DRIVER_STATUS_6"
) {
  return null;
}

let driver = knownDrivers[driver_index];
if (!driver) {
  driver = {
    has_status1: false,
    has_status6: false,
    created: false,
    is_dimmable: false,
    last_brightness: 100,
  };
  knownDrivers[driver_index] = driver;
}

let needsRecreate = false;

if (payload.dgn_name === "DC_COMPONENT_DRIVER_STATUS_1") {
  driver.has_status1 = true;
  // Determine state: 00=off, 01=on
  if (payload.output_on === 1) {
    driver.state = "ON";
  } else if (payload.output_on === 0) {
    driver.state = "OFF";
  }
}

if (payload.dgn_name === "DC_COMPONENT_DRIVER_STATUS_6") {
  driver.has_status6 = true;
  driver.brightness = Math.round(Math.min(100, payload.pwm_duty_cycle)); // 0-100%

  if (payload.pwm_duty_cycle > 0 && payload.pwm_duty_cycle < 100) {
    if (!driver.is_dimmable) {
      driver.is_dimmable = true;
      if (driver.created) {
        needsRecreate = true; // Mark for upgrade to dimmable
        driver.created = false; // Force re-creation
      }
    }
  }
}

const messages = [];

const entityId = `switch_${driver_index}`;
const stateTopic = `homeassistant/light/${entityId}/state`;
const commandTopic = `homeassistant/light/${entityId}/set`;

// Create entity if not created and we have either status
if (!driver.created && (driver.has_status1 || driver.has_status6)) {
  let config = {
    name: `Switch ${driver_index}`,
    unique_id: entityId,
    default_entity_id: `light.${entityId}`,
    icon: "mdi:light-recessed",
    schema: "json",
    state_topic: stateTopic,
    command_topic: commandTopic,
    availability_mode: "all",
    availability: [
      { topic: "librecoach/nodered/status", payload_available: "online", payload_not_available: "offline" },
      { topic: "can/status", value_template: "{{ 'online' if value == 'online' else 'offline' }}", payload_available: "online", payload_not_available: "offline" },
    ],
    device: {
      identifiers: ["librecoach-switches"],
      name: "Switches",
      manufacturer: "LibreCoach",
    },
  };

  if (driver.is_dimmable) {
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

  driver.created = true;
}

// Publish state updates
if (driver.created) {
  let stateOut = {
    state: driver.state || "OFF",
  };

  // Only output color_mode if we aren't currently waiting for a dimmable config to apply
  if (driver.is_dimmable && !needsRecreate) {
    stateOut.color_mode = "brightness";
    if (driver.brightness !== undefined) {
      stateOut.brightness = driver.brightness;
      if (driver.brightness > 0) {
        driver.last_brightness = driver.brightness;
      }
    }
  } else {
    stateOut.color_mode = "onoff";
  }

  messages.push({
    topic: stateTopic,
    payload: stateOut,
  });
}

flow.set("knownDcDrivers", knownDrivers);

if (messages.length === 0) return null;

return [messages];
