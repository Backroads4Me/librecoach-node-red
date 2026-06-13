// Self-creating HA Status Publisher for GENERIC_INDICATOR_COMMAND (DGN 1FED9h, §6.26.2)
// Eavesdrops on indicator commands to infer light state.
// Entity naming: switch_i_N (instance) or switch_g_N (group).
// Routing keys: "switch_i" (instance), "switch_g" (group).
// Output 1: [messages] → MQTT Out

if (!msg.payload || typeof msg.payload !== "object") {
  return null;
}

const p = msg.payload;

if (typeof p.instance !== "number" || typeof p.function_raw !== "number") {
  return null;
}

// --- State inference ---
// Only 0x00 and 0x11 reach here (decoder gates all other function types).
function inferState(fn, bRaw) {
  if (typeof bRaw === "number" && bRaw <= 200) {
    return bRaw > 0 ? "ON" : "OFF";
  }
  return null;
}

const haStatus = inferState(p.function_raw, p.brightness_raw);
if (haStatus === null) {
  return null;
}

// Brightness as 0-100%
let brightness;
if (typeof p.brightness_raw === "number" && p.brightness_raw <= 200) {
  brightness = parseFloat((p.brightness_raw * 0.5).toFixed(1));
}

// --- Build target list ---
const targets = [];

if (p.instance >= 1 && p.instance <= 250) {
  // Specific instance
  targets.push({
    entityId: `switch_i_${p.instance}`,
    displayName: `Switch ${p.instance}`,
  }); // routing key: switch_i
} else if (
  p.instance === 255 &&
  p.is_group_command &&
  Array.isArray(p.groups) &&
  p.groups.length > 0
) {
  // Group command — one entity per targeted group
  for (const g of p.groups) {
    targets.push({
      entityId: `switch_g_${g}`,
      displayName: `Switch Group ${g}`,
    }); // routing key: switch_g
  }
} else {
  // instance=0 (all instances broadcast) — no specific entity to update
  return null;
}

// --- Dimmable detection ---
// Uses separate array from DC_DIMMER/DC_LOAD to avoid cross-contamination
// (those store numeric instances; indicators use entityId strings for group support)
const dimmableIndicators = global.get("dimmableIndicators", "file") || [];
const CREATED_KEY = "genericIndicatorCreated";
const created = flow.get(CREATED_KEY) || {};
const messages = [];

for (const { entityId, displayName } of targets) {
  let isDimmable = dimmableIndicators.includes(entityId);
  let needsRecreate = false;

  // Intermediate brightness (1-199 raw = 0.5-99.5%) or Ramp → dimmable
  if (!isDimmable) {
    if (
      (typeof p.brightness_raw === "number" &&
        p.brightness_raw >= 1 &&
        p.brightness_raw <= 199) ||
      p.function_raw === 0x11
    ) {
      dimmableIndicators.push(entityId);
      isDimmable = true;
      needsRecreate = true;
    }
  }

  if (!created[entityId] || needsRecreate) {
    const config = {
      name: displayName,
      unique_id: entityId,
      default_entity_id: `light.${entityId}`,
      icon: "mdi:light-recessed",
      schema: "json",
      command_topic: `homeassistant/light/${entityId}/set`,
      state_topic: `homeassistant/light/${entityId}/state`,
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

    created[entityId] = true;
  }

  if (isDimmable && typeof brightness === "number" && brightness > 0) {
    global.set("indicatorBrightness_" + entityId, brightness, "file");
  }

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
    topic: `homeassistant/light/${entityId}/state`,
    payload: JSON.stringify(stateObj),
  });
}

if (messages.length === 0) return null;

global.set("dimmableIndicators", dimmableIndicators, "file");
flow.set(CREATED_KEY, created);
return [messages];
