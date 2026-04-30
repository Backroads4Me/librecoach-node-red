const victronEnabled = global.get("victronEnabled");
if (!victronEnabled) return null;

// Store active Victron device instances from ProductName topics
// Input: msg.topic = N/{portalId}/{serviceType}/{instance}/ProductName

const topic = msg.topic;
if (!topic) return null;

const parts = topic.split("/");
if (parts.length < 5) return null;

const serviceType = parts[2];
const instance = parts[3];
const key = `${serviceType}_${instance}`;

// Extract product name from payload
let productName = "";
if (typeof msg.payload === "string") {
  try {
    productName = JSON.parse(msg.payload).value || "";
  } catch (e) {
    productName = msg.payload;
  }
} else if (typeof msg.payload === "object" && msg.payload !== null) {
  productName = msg.payload.value || "";
}

// Build short name from first two alpha words of product name (skip model numbers)
const alphaWords = productName.split(/\s+/).filter((w) => /^[a-zA-Z]/.test(w));
const shortName = alphaWords
  .slice(0, 2)
  .join("_")
  .replace(/[^a-zA-Z0-9_-]/g, "")
  .toLowerCase();

// Get or initialize the active devices object
let victronDevices = global.get("victronDevices", "file") || {};

// Store or update device entry
victronDevices[key] = {
  productName: productName,
  shortName: shortName || serviceType,
};

global.set("victronDevices", victronDevices, "file");

node.status({
  fill: "green",
  shape: "dot",
  text: `${Object.keys(victronDevices).length} active devices`,
});

return null;
