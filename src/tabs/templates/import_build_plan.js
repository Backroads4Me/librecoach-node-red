// Cross-references import entities with current HA entities
// Input:
//   msg.payload = array of state objects from GET /api/states
//   msg.importConfig = { customized, skippedUnchanged, totalInFile }
// Output 1: msg.payload = array of { entity_id, friendly_name } for Split pipeline
// Output 2: msg.payload = early HTTP response when no entities to update

const states = msg.payload;
const config = msg.importConfig;

if (!Array.isArray(states) || !config) {
    msg.payload = { error: "Failed to retrieve HA states." };
    msg.statusCode = 500;
    return [null, msg];
}

// Build set of entity IDs currently in HA
const haEntityIds = new Set(states.map((s) => s.entity_id));

// Cross-reference: only include entities that exist in HA
const toUpdate = [];
let skippedMissing = 0;

for (const entity of config.customized) {
    if (haEntityIds.has(entity.entity_id)) {
        toUpdate.push(entity);
    } else {
        skippedMissing++;
    }
}

// Store counts for summarize_import
msg.importCounts = {
    totalInFile: config.totalInFile,
    skippedUnchanged: config.skippedUnchanged,
    skippedMissing: skippedMissing,
    toUpdate: toUpdate.length,
};

if (toUpdate.length === 0) {
    msg.payload = {
        updated: 0,
        skipped: skippedMissing + config.skippedUnchanged,
        failed: 0,
        message: "No matching entities found in HA to update.",
    };
    msg.statusCode = 200;
    node.status({ fill: "yellow", shape: "dot", text: "Nothing to update" });
    return [null, msg];
}

msg.payload = toUpdate;

node.status({
    fill: "blue",
    shape: "dot",
    text: `${toUpdate.length} to update, ${skippedMissing} skipped`,
});

return [msg, null];
