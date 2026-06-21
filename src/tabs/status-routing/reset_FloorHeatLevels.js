// --- Reset persistent and in-memory context cleanly ---

// Helper function to clear both stores
function clearContext(key) {
    // Remove persistent value
    global.set(key, undefined, "file");
    // Remove in-memory value
    global.set(key, undefined);
}

// --- Clear specific global variables ---
clearContext("uniqueFloorHeatLevels");
clearContext("floorHeatLevelMap");

// --- Clear specific flow variables ---
flow.set("uniqueFloorHeat", undefined, "file");
flow.set("uniqueFloorHeat", undefined);
flow.set("floorHeatLevelMap", undefined, "file");
flow.set("floorHeatLevelMap", undefined);

node.warn("Context cleared");
return null;