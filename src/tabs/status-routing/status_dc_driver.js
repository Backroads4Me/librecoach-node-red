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
  // pwm_duty_cycle is absent when the decoder saw an RV-C special value
  // (error/not available) — keep the previous brightness in that case.
  if (typeof payload.pwm_duty_cycle === "number") {
    driver.brightness = Math.round(Math.min(100, payload.pwm_duty_cycle)); // 0-100%

    if (payload.pwm_duty_cycle > 0 && payload.pwm_duty_cycle < 100) {
      driver.is_dimmable = true;
    }
  }
}

const messages = [];

const entityId = `switch_${driver_index}`;
const entityName = `Switch ${driver_index}`;
const stateTopic = `homeassistant/light/${entityId}/state`;
const commandTopic = `homeassistant/light/${entityId}/set`;

// Capability is persisted per driver in knownDcDrivers (file store, saved at
// the end of this node) so discovery runs only on a genuine capability change,
// never on every restart. Only a fractional PWM proves a driver can dim; a
// full-on/off reading does not.
const priorMode = driver.publishedMode;
let isDimmable = driver.is_dimmable;

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

driver.is_dimmable = isDimmable;
driver.publishedMode = desiredMode;

// Publish state updates — but only once STATUS_1 has told us on/off.
// A STATUS_6-only driver has brightness but unknown state; publishing
// the "OFF" default would show a lit light as off in HA.
if (driver.publishedMode && driver.has_status1) {
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
