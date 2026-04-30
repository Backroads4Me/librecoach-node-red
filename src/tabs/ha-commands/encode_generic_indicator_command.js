// Encodes GENERIC_INDICATOR_COMMAND (DGN 1FED9h, §6.26.2)
// Handles both routing keys:
//   switch_i → instance-targeted command (byte 0 = instance, byte 1 = 0xFF non-group)
//   switch_g → group-targeted command   (byte 0 = 0xFF,      byte 1 = group bitmap)

const PRIORITY = 6;
const DGN = "1FED9";
const SOURCE_ADDRESS = global.get("rvc_source_address") || 254;

const routingKey = msg.routingKey;
const instance = msg.instance; // instance number OR group number depending on routingKey

if (typeof instance !== "number") {
  node.warn(`[encode_generic_indicator_command] Invalid instance: ${instance}`);
  return null;
}

// Build byte 0 (instance) and byte 1 (group bitmap)
let byte0, byte1;

if (routingKey === "switch_i") {
  if (instance < 1 || instance > 250) {
    node.warn(
      `[encode_generic_indicator_command] Instance out of range: ${instance}`,
    );
    return null;
  }
  byte0 = instance;
  byte1 = 0xff; // non-group command
} else if (routingKey === "switch_g") {
  if (instance < 1 || instance > 7) {
    node.warn(
      `[encode_generic_indicator_command] Group out of range: ${instance}`,
    );
    return null;
  }
  byte0 = 0xff; // no specific instance (group command)
  // Bit 7=0 (group command), bit (group-1)=0 (targets this group), all others=1
  byte1 = 0x7f & ~(1 << (instance - 1));
} else {
  node.warn(
    `[encode_generic_indicator_command] Unknown routingKey: ${routingKey}`,
  );
  return null;
}

// Parse HA command — JSON schema: msg.payload is always an object
const command = msg.payload.state;
const brightnessIn = msg.payload.brightness;

// Resolve entity ID for dimmable/brightness lookups
const entityId =
  routingKey === "switch_g" ? `switch_g_${instance}` : `switch_i_${instance}`;
const dimmableIndicators = global.get("dimmableIndicators", "file") || [];
const isDimmable = dimmableIndicators.includes(entityId);

// Determine brightness raw value (0-200 scale, 0.5% per step)
// HA sends brightness as 0-100% (brightness_scale: 100 set in discovery)
let brightnessRaw;

if (command === "OFF") {
  brightnessRaw = 0;
} else if (brightnessIn !== undefined && brightnessIn > 0) {
  brightnessRaw = Math.min(200, Math.round(brightnessIn * 2));
} else if (isDimmable) {
  const lastBrightness =
    global.get("indicatorBrightness_" + entityId, "file") || 100;
  brightnessRaw = Math.min(200, Math.round(lastBrightness * 2));
} else {
  brightnessRaw = 200; // full brightness for non-dimmable ON
}

// Store last brightness (in 0-100% scale) and state for recall / optimistic update
if (command !== "OFF" && brightnessRaw > 0) {
  global.set("indicatorBrightness_" + entityId, brightnessRaw / 2, "file");
}
global.set("indicatorState_" + entityId, command, "file");

// Optimistic HA state publish — no CAN echo expected for self-sent commands
const storedBrightness = global.get("indicatorBrightness_" + entityId, "file");

const stateObj = { state: command };
if (command === "ON") {
  if (
    isDimmable &&
    typeof storedBrightness === "number" &&
    storedBrightness > 0
  ) {
    stateObj.color_mode = "brightness";
    stateObj.brightness = storedBrightness;
  } else {
    stateObj.color_mode = "onoff";
  }
}

// Build 8-byte data payload per §6.26.2 Table 6.26.2b
const dataBytes = [
  byte0, // Byte 0: Instance
  byte1, // Byte 1: Group bitmap
  brightnessRaw, // Byte 2: Brightness (0-200)
  0xff, // Byte 3: Bank Select (0xFF = not supported)
  0xff, // Byte 4: Duration (0xFF = continuous)
  0xff, // Byte 5: Reserved
  0x00, // Byte 6: Function (0x00 = Set Brightness)
  0xff, // Byte 7: Reserved
];

const dataHex = dataBytes
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("");

const dgnInt = parseInt(DGN, 16);
const canIdInt = (PRIORITY << 26) | (dgnInt << 8) | SOURCE_ADDRESS;
const canIdHex = canIdInt.toString(16).padStart(8, "0");

// Send both through output 1: CAN frame to bridge, then optimistic HA state update
return [
  [
    {
      topic: "can/send",
      payload: `${canIdHex.toUpperCase()}#${dataHex.toUpperCase()}`,
    },
    {
      topic: `homeassistant/light/${entityId}/state`,
      payload: JSON.stringify(stateObj),
      retain: true,
    },
  ],
];
