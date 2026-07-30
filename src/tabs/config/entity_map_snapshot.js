// Join stable LibreCoach MQTT discovery unique IDs to Home Assistant's current
// entity registry and effective friendly names, then publish one complete
// retained snapshot. Replacing this payload atomically removes stale mappings.

if (!Array.isArray(msg.entityRegistry)) {
  node.error("Entity map build is missing the entity registry", msg);
  return null;
}
if (!Array.isArray(msg.payload)) {
  node.error("Entity map build is missing Home Assistant states", msg);
  return null;
}

const discovery = global.get("entityMapDiscovery", "file") || {};
const records = Object.values(discovery);
const byUniqueId = new Map();
for (const record of records) {
  if (!record || typeof record.unique_id !== "string") continue;
  if (byUniqueId.has(record.unique_id)) {
    node.error(`Duplicate LibreCoach discovery unique_id ${record.unique_id}`, msg);
    return null;
  }
  byUniqueId.set(record.unique_id, record);
}

const registryByUniqueId = new Map();
for (const entry of msg.entityRegistry) {
  if (!entry || typeof entry.unique_id !== "string") continue;
  if (!byUniqueId.has(entry.unique_id)) continue;
  if (registryByUniqueId.has(entry.unique_id)) {
    node.error(`Ambiguous Home Assistant unique_id ${entry.unique_id}`, msg);
    return null;
  }
  registryByUniqueId.set(entry.unique_id, entry);
}

const states = new Map(msg.payload
  .filter((state) => state && typeof state.entity_id === "string")
  .map((state) => [state.entity_id, state]));
const entities = [];
for (const [uniqueId, record] of byUniqueId) {
  const registry = registryByUniqueId.get(uniqueId);
  if (!registry || typeof registry.entity_id !== "string") continue;
  const state = states.get(registry.entity_id);
  const stateName = state?.attributes?.friendly_name;
  const registryName = typeof registry.name === "string" &&
    registry.name.trim() ? registry.name.trim() : null;
  const friendlyName = typeof stateName === "string" && stateName.trim()
    ? stateName.trim()
    : registryName || record.original_name;
  const component = registry.entity_id.split(".")[0];
  if (!component || !friendlyName) continue;

  entities.push({
    entity_id: registry.entity_id,
    friendly_name: friendlyName,
    name_source: registryName
      ? "owner-customized" : "librecoach-default",
    unique_id: uniqueId,
    object_id: record.object_id,
    original_name: record.original_name,
    component,
    state_bindings: (record.bindings || []).filter((binding) =>
      binding.role === "state"),
    command_bindings: (record.bindings || []).filter((binding) =>
      binding.role === "command"),
    bindings: record.bindings || [],
    binding_authority: "librecoach-node-red entity publishers",
  });
}
entities.sort((a, b) =>
  a.unique_id.localeCompare(b.unique_id) ||
  a.entity_id.localeCompare(b.entity_id));

msg.topic = "rvc/entity-map";
msg.qos = 1;
msg.retain = true;
msg.payload = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  source: {
    authority: "librecoach-node-red",
    home_assistant: "entity-registry+states",
  },
  entities,
};
node.status({
  fill: "green",
  shape: "dot",
  text: `${entities.length} entities`,
});
return msg;
