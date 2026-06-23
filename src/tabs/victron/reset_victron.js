global.set("uniqueVictron", []);

// Clear per-entity discovery signatures so configs republish on rediscovery.
const keys = global.keys ? global.keys("file") : [];
for (const k of keys) {
    if (k.startsWith("victron_") && k.endsWith("_dsig")) global.set(k, undefined, "file");
}

return null;  // Nothing needs to go downstream