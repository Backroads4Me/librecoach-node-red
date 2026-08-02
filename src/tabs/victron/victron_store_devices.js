const victronEnabled = global.get("victronEnabled");
if (!victronEnabled) return null;

// Store active Victron device instances from ProductName and CustomName topics
// Input: msg.topic = N/{portalId}/{serviceType}/{instance}/{ProductName|CustomName}

const topic = msg.topic;
if (!topic) return null;

const parts = topic.split("/");
if (parts.length < 5) return null;

const serviceType = parts[2];
const instance = parts[3];
const portalId = parts[1];
const field = parts[4];
const key = `${serviceType}_${instance}`;

// Services whose product name describes a function rather than a device
// ("Generator start/stop") make a poor entity-id component; use the service
// type, which is already unique per instance.
const genericNameServices = ["generator"];

// Extract the name from the payload
let name = "";
if (typeof msg.payload === "string") {
  try {
    name = JSON.parse(msg.payload).value || "";
  } catch (e) {
    name = msg.payload;
  }
} else if (typeof msg.payload === "object" && msg.payload !== null) {
  name = msg.payload.value || "";
}
name = typeof name === "string" ? name.trim() : "";

// Get or initialize the active devices object
let victronDevices = global.get("victronDevices", "file") || {};

// ProductName and CustomName arrive as separate messages, so merge into the
// existing entry rather than replacing it.
const device = victronDevices[key] || {};
const previousCustomName = device.customName;
const knownDevice = Boolean(victronDevices[key]);
const hadShortName = Boolean(device.shortName);

if (field === "CustomName") {
  // The name the user assigned on the GX. It is the only thing that tells four
  // identical Orion XS chargers apart, so victron_create prefers it verbatim.
  device.customName = name;
} else {
  device.productName = name;

  // Short name from the first two alpha words of the product name (skip model
  // numbers). This feeds unique_id/entity_id, so it is deliberately derived
  // from ProductName only — renaming a device on the GX must not orphan the
  // existing HA entities.
  const alphaWords = name.split(/\s+/).filter((w) => /^[a-zA-Z]/.test(w));
  const derivedShortName =
    alphaWords
      .slice(0, 2)
      .join("_")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .toLowerCase() || serviceType;
  device.shortName = genericNameServices.includes(serviceType)
    ? serviceType
    : derivedShortName;
}

victronDevices[key] = device;
global.set("victronDevices", victronDevices, "file");

// A device whose CustomName arrived before its ProductName had no shortName
// while its values were flowing, so the decoder's discovery gate dropped them.
// Venus resends only on request, so ask for a full republish now that the
// device is complete. One request covers every device, so a startup burst is
// coalesced into a single republish.
const REPUBLISH_COOLDOWN_MS = 15000;
let republish = false;
if (field !== "CustomName" && knownDevice && !hadShortName) {
  const lastRequest = global.get("victronRepublishRequested") || 0;
  if (Date.now() - lastRequest > REPUBLISH_COOLDOWN_MS) {
    global.set("victronRepublishRequested", Date.now());
    republish = true;
  }
}

let refreshPaths = [];
if (field === "CustomName" && previousCustomName !== name) {
  // Retained topics arrive in arbitrary order, so entities for this device may
  // already have been announced under the ProductName prefix. Dropping the
  // device's dedup keys lets the next value message re-run discovery;
  // victron_create's payload signature check then republishes only the configs
  // whose name actually changed.
  const uniqueVictron = global.get("uniqueVictron") || [];
  const devicePrefix = `${serviceType}_${instance}_`;
  refreshPaths = uniqueVictron
    .filter((k) => k.startsWith(devicePrefix))
    .map((k) => k.slice(devicePrefix.length));
  const remaining = uniqueVictron.filter((k) => !k.startsWith(devicePrefix));
  if (remaining.length !== uniqueVictron.length) {
    global.set("uniqueVictron", remaining);
  }
}

node.status({
  fill: "green",
  shape: "dot",
  text: `${Object.keys(victronDevices).length} active devices`,
});

if (republish) {
  return [{ reset: true }, { topic: `R/${portalId}/keepalive`, payload: "" }];
}

if (refreshPaths.length === 0) return null;

// Reset the upstream and decoder filters before requesting unchanged values.
// Each response then follows the normal metadata and discovery pipeline with
// the current device name. Synthetic paths are harmless if Venus ignores them;
// their real source paths are also requested and recreate them locally.
const refreshMessages = refreshPaths.map((dbusPath) => ({
  topic: `R/${portalId}/${serviceType}/${instance}${dbusPath}`,
  payload: "",
}));

return [{ reset: true }, refreshMessages];
