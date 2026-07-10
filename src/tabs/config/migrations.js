// One-time migration runner.
//
// Runs once at startup (inject node). Each migration executes exactly once
// per install; completed ids are recorded in the file-backed global context
// key "migrationsRun", which survives restarts and add-on upgrades.
//
// Rules:
// - APPEND-ONLY: never edit or remove a shipped entry's id — installs in the
//   field have it recorded and matching is by id.
// - IDEMPOTENT: write each migration so re-running is harmless (the ledger
//   is a courtesy, not a lock — a wiped context re-runs everything).
// - Keep migrations self-contained one-time actions (clear context keys,
//   publish MQTT cleanup, rename stored state). Recurring logic belongs in
//   the owning tab, not here.

const MIGRATIONS = [
    {
        // Discovery payload shape changed (enum label templates, energy
        // state_class, new whitelist paths). Clear the unique/signature caches
        // so every entity's MQTT discovery config republishes.
        id: "2026-07-10-victron-discovery-refresh",
        run: () => {
            global.set("uniqueVictron", []);
            const keys = global.keys ? global.keys("file") : [];
            for (const k of keys) {
                if (k.startsWith("victron_") && k.endsWith("_dsig")) {
                    global.set(k, undefined, "file");
                }
            }
        },
    },
];

const done = global.get("migrationsRun", "file") || [];
let applied = 0;

for (const migration of MIGRATIONS) {
    if (done.includes(migration.id)) continue;

    try {
        migration.run();
    } catch (err) {
        // Do not record a failed migration — it retries on next startup.
        node.error(`migration failed: ${migration.id}: ${err.message}`, msg);
        break;
    }

    // Record immediately so a later failure can't lose this one.
    done.push(migration.id);
    global.set("migrationsRun", done, "file");
    applied++;
    node.warn(`migration applied: ${migration.id}`);
}

node.status({
    fill: "green",
    shape: "dot",
    text: applied
        ? `${applied} migration(s) applied`
        : `up to date (${done.length} recorded)`,
});

return null;
