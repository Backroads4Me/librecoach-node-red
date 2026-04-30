// Parse Home Assistant MQTT command topics

// --- Cover (Shade) entities ---
const rvcTopicMatch = msg.topic.match(
  /^homeassistant\/cover\/shade_(\d+)\/set$/,
);
if (rvcTopicMatch) {
  const instance = parseInt(rvcTopicMatch[1], 10);
  const command = String(msg.payload).toUpperCase();
  msg.routingKey = "cover";
  msg.instance = instance;
  msg.command = command;
  msg.entityType = "cover";
  msg.entityId = `shade_${instance}`;
  return msg;
}

// --- Lock entities ---
const lockTopicMatch = msg.topic.match(
  /^homeassistant\/lock\/lock_(\d+)\/set$/,
);
if (lockTopicMatch) {
  const instance = parseInt(lockTopicMatch[1], 10);
  const command = String(msg.payload).toUpperCase();
  msg.routingKey = "lock";
  msg.instance = instance;
  msg.command = command;
  msg.entityType = "lock";
  msg.entityId = `lock_${instance}`;
  return msg;
}

// --- Climate (Floor Heat) Preset entities ---
const climatePresetMatch = msg.topic.match(
  /^homeassistant\/climate\/floor_heat_(\d+)\/set_preset_mode$/,
);
if (climatePresetMatch) {
  const instance = parseInt(climatePresetMatch[1], 10);
  msg.routingKey = "floor_heat";
  msg.instance = instance;
  msg.entityType = "climate";
  msg.entityId = `floor_heat_${instance}`;
  msg.command = "SET_PRESET";
  msg.value = String(msg.payload); // e.g., "Level 5"
  return msg;
}

// --- Climate (Floor Heat) Mode entities ---
const climateTopicMatch = msg.topic.match(
  /^homeassistant\/climate\/floor_heat_(\d+)\/set_mode$/,
);
if (climateTopicMatch) {
  const instance = parseInt(climateTopicMatch[1], 10);
  msg.routingKey = "floor_heat";
  msg.instance = instance;
  msg.entityType = "climate";
  msg.entityId = `floor_heat_${instance}`;
  msg.command = String(msg.payload).toUpperCase(); // "HEAT" or "OFF"
  return msg;
}

// --- Aqua-Hot entities ---
const aquahotTopicMatch = msg.topic.match(
  /^homeassistant\/light\/aquahot_(burner|ac_1|ac_2|engine)\/set$/,
);
if (aquahotTopicMatch) {
  const instance = aquahotTopicMatch[1]; // "burner", "ac_1", "ac_2", or "engine"
  const command = String(msg.payload).toUpperCase();
  msg.routingKey = "aquahot";
  msg.instance = instance;
  msg.command = command;
  msg.entityType = "light";
  msg.entityId = `aquahot_${instance}`;
  return msg;
}

// --- Switch and Light entities (Fallback) ---
const topicParts = msg.topic.split("/");
if (
  topicParts.length === 4 &&
  topicParts[0] === "homeassistant" &&
  (topicParts[1] === "switch" || topicParts[1] === "light") &&
  topicParts[3] === "set"
) {
  const entityId = topicParts[2];
  msg.entityType = topicParts[1];
  msg.entityId = entityId;

  // Handle JSON payloads from dimmable lights (JSON schema entities)
  try {
    const parsed = JSON.parse(msg.payload);
    if (typeof parsed === "object" && parsed !== null) {
      msg.payload = parsed;
      msg.command = parsed.state ? parsed.state.toUpperCase() : "ON";
    } else {
      msg.command = String(msg.payload).toUpperCase();
    }
  } catch (e) {
    // Simple string payload (non-dimmable lights)
    msg.command = String(msg.payload).toUpperCase();
  }

  if (entityId === "water_pump" || entityId === "autofill") {
    msg.instance = entityId;
    msg.routingKey = entityId;
  } else {
    const entityIdParts = entityId.split("_");
    const instanceStr = entityIdParts[entityIdParts.length - 1];
    const instanceNum = parseInt(instanceStr, 10);
    if (isNaN(instanceNum)) {
      node.warn(`Could not parse instance number from entityId: ${entityId}`);
      return null;
    }
    msg.instance = instanceNum;
    msg.routingKey = entityIdParts.slice(0, -1).join("_");
  }
  return msg;
}

node.warn(`Unhandled MQTT topic: ${msg.topic}`);
return null;
