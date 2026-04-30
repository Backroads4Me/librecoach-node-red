// Stores RV info values from text input entities to flow context
// Input: msg.topic = "librecoach/rv_info/{field}/set"
//        msg.payload = value string
// Output: Republishes to state topic for HA sync

// Parse the topic to get the field name
const topicMatch = msg.topic.match(/^librecoach\/rv_info\/(\w+)\/set$/);
if (!topicMatch) {
  node.warn(`Unexpected topic format: ${msg.topic}`);
  return null;
}

const field = topicMatch[1];
const value = String(msg.payload).trim();

// Valid fields
const validFields = ["rv_manufacturer", "rv_model", "rv_year", "rv_other"];
if (!validFields.includes(field)) {
  node.warn(`Unknown RV info field: ${field}`);
  return null;
}

// Get current RV info from flow context or initialize
let rvInfo = flow.get("rvInfo") || {
  rv_manufacturer: "",
  rv_model: "",
  rv_year: "",
  rv_other: "",
};

// Update the field
rvInfo[field] = value;

// Store back to flow context
flow.set("rvInfo", rvInfo);

// Also persist to global file store so create_user_toggles.js can restore on restart
global.set(field, value, "file");

// Republish to state topic for HA to confirm the update
msg.topic = `librecoach/rv_info/${field}`;
msg.payload = value;

node.status({ fill: "green", shape: "dot" });

return msg;
