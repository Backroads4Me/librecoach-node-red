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

// Persist discovery state in the FILE store so published capability and
// dimmability survive Node-RED restarts. With flow (memory) context this reset
// every boot, so the first plain on/off status after a restart re-published an
// onoff config and downgraded an already-dimmable entity. See status_dc_dimmer_3.js.
let knownDrivers = global.get("knownDcDrivers", "file");
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
    publishedMode: null,
    is_dimmable: false,
    last_brightness: 100,
  };
  knownDrivers[driver_index] = driver;
}

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
    driver.is_dimmable = true;
  }
}

const messages = [];

const entityId = `switch_${driver_index}`;
const stateTopic = `homeassistant/light/${entityId}/state`;
const commandTopic = `homeassistant/light/${entityId}/set`;

// Self-creating discovery. HA won't hot-swap supported_color_modes on an
// existing entity, so an onoff -> brightness change requires delete-then-recreate.
// Dimmability is monotonic (only a fractional PWM proves a driver can dim; a
// full-on/off reading does not), so we never downgrade brightness -> onoff —
// this stops a plain on/off status from re-stickng a dimmable entity to a toggle.
if (driver.publishedMode === "brightness") {
  driver.is_dimmable = true;
}
const desiredMode = driver.is_dimmable ? "brightness" : "onoff";

// Create/update entity if the published mode is stale and we have either status
if (
  driver.publishedMode !== desiredMode &&
  (driver.has_status1 || driver.has_status6)
) {
  // Remove any existing retained config first so HA recreates the entity fresh
  // with the new capability. Harmless no-op if nothing is retained yet.
  messages.push({
    topic: `homeassistant/light/${entityId}/config`,
    payload: "",
  });

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

  driver.publishedMode = desiredMode;
}

// Publish state updates
if (driver.publishedMode) {
  let stateOut = {
    state: driver.state || "OFF",
  };

  // color_mode must match the advertised discovery config for this cycle
  if (driver.is_dimmable) {
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

global.set("knownDcDrivers", knownDrivers, "file");

if (messages.length === 0) return null;

return [messages];
