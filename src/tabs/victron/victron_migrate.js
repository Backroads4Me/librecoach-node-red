// One-shot migration: purge pre-v1.3 Victron discovery configs so entities
// are recreated with the new `default_entity_id` IDs.

const TARGET = "entityid-librecoach-v1";

// Already migrated for this marker version — nothing to do.
if (global.get("victronEntityIdMigration", "file") === TARGET) {
    node.status({ fill: "grey", shape: "ring", text: "migration: done" });
    return null;
}

const topics = global.get("victronDiscoveryTopics", "file") || [];

// 1. Delete old discovery configs
topics.forEach((topic) => {
    node.send({ topic: topic, payload: "" });
});

// 2. Reset filter/tracking
global.set("uniqueVictron", []);
global.set("victronDiscoveryTopics", [], "file");

// 3. Stamp the marker so this never runs again for this version.
global.set("victronEntityIdMigration", TARGET, "file");

node.status({
    fill: "blue",
    shape: "dot",
    text: `migration: purged ${topics.length}`,
});

return null;