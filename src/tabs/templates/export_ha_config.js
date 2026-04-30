// Builds export configuration from Home Assistant states
// Input:
//   msg.states - Array from /api/states
//   msg.rvInfo - Object with RV metadata (manufacturer, model, year, other)
// Output: msg.exportConfig (object), msg.exportFilename (string)

const ENTITY_PATTERNS = [
  /^light\.switch_\d+$/,
  /^cover\.shade_\d+$/,
  /^lock\.lock_\d+$/,
  /^switch\.water_pump$/,
  /^switch\.autofill$/,
  /^sensor\.\w+_tank$/,
  /^sensor\.\w+_battery$/,
  /^climate\.floor_heat_\d+$/,
  /^light\.aquahot_(burner|ac_1|ac_2|engine)$/,
];

if (!msg.states || !Array.isArray(msg.states)) {
  node.error("Input missing 'states' array from /api/states", msg);
  return null;
}

const entities = {};

for (const state of msg.states) {
  const entityId = state.entity_id;

  const isLibreCoachEntity = ENTITY_PATTERNS.some((pattern) =>
    pattern.test(entityId),
  );

  if (!isLibreCoachEntity) {
    continue;
  }

  const attributes = state.attributes || {};
  const friendlyName = attributes.friendly_name || entityId;

  // Skip entities with the default HA-generated name (not user-customized)
  if (friendlyName.startsWith("LibreCoach: ")) {
    continue;
  }

  const parts = entityId.split(".");
  const domain = parts[0];
  const entityName = parts[1];

  let instance = null;
  const instanceMatch = entityName.match(/_(\d+)$/);
  if (instanceMatch) {
    instance = parseInt(instanceMatch[1], 10);
  } else if (entityName === "water_pump" || entityName === "autofill") {
    instance = entityName;
  } else {
    const aquahotMatch = entityName.match(
      /^aquahot_(burner|ac_1|ac_2|engine)$/,
    );
    if (aquahotMatch) {
      instance = aquahotMatch[1];
    }
  }

  let originalName = entityName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  entities[entityId] = {
    entity_id: entityId,
    original_name: originalName,
    friendly_name: friendlyName,
    device_class: domain,
    instance: instance,
  };
}

const exportConfig = {
  export_date: new Date().toISOString(),
  rv_info: msg.rvInfo || {
    manufacturer: "Unknown",
    model: "Unknown",
    year: "Unknown",
    other: "Unknown",
  },
  entities: entities,
};

msg.exportConfig = exportConfig;

const rvInfo = msg.rvInfo || {};
const filenameParts = ["manufacturer", "model", "year", "other"]
  .map((key) => (rvInfo[key] || "").toString().trim())
  .filter((val) => val.length > 0 && val !== "Unknown")
  .map((val) => val.replace(/\s+/g, "-"));

msg.exportFilename =
  filenameParts.length > 0
    ? filenameParts.join("_") + ".json"
    : "librecoach_config.json";

const entityCount = Object.keys(entities).length;
node.status({ fill: "green", shape: "dot", text: `${entityCount} entities` });

return msg;
