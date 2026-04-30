// Unique Filter for Floor Heat

// --- Configuration ---
const instanceKey = "uniqueFloorHeat"; // Session-only
const levelsKey = "uniqueFloorHeatLevels"; // Persistent

// Get data from payload ---
const instanceId = msg.payload.instance;
const raw_setpoint = msg.payload.raw_setpoint;

// Validate input ---
if (typeof instanceId !== "number") {
  return null; // No instance, can't proceed
}

// We only want to discover a level if:
// The setpoint is within a plausible floor heat range (32°F–120°F)
// RVC raw range: 8746 (32°F/0°C) to 12576 (120°F/~49°C)
// Note: schedule_mode is not checked because the store level is always
// reported with schedule_mode "Disabled", preventing its discovery.
const isValidLevel =
  typeof raw_setpoint === "number" &&
  raw_setpoint >= 8746 &&
  raw_setpoint <= 12576;

// Get context lists ---
let instanceList = flow.get(instanceKey) || [];
let levelList = global.get(levelsKey, "file") || [];

let isNewInstance = false;
let isNewLevel = false;

// Process Instance ---
if (!instanceList.includes(instanceId)) {
  isNewInstance = true;
  instanceList.push(instanceId);
  flow.set(instanceKey, instanceList); // Save to session context
}

// Process Level ---
if (isValidLevel && !levelList.includes(raw_setpoint)) {
  isNewLevel = true;
  levelList.push(raw_setpoint);
  levelList.sort((a, b) => a - b);
  global.set(levelsKey, levelList, "file"); // Save to persistent context
  node.log(`Discovered new floor heat level: ${raw_setpoint}`);
}

// Output Logic ---
if (!isNewInstance && !isNewLevel) {
  return null; // Nothing new, stop here
}

if (isNewLevel) {
  //node.warn(`New level found. Sending config updates for all known instances: ${instanceList.join(', ')}`);

  let outputs = [];
  for (const inst of instanceList) {
    outputs.push({ payload: { instance: inst } });
  }
  return outputs;
}

if (isNewInstance) {
  return { payload: { instance: instanceId } };
}

return null;
