// Reads RV info and sets up HA API request configuration
// Input: msg (triggered by export button)
// Output: msg with rvInfo, headers, and url for first API call

const haBaseUrl = "http://supervisor/core";
const haToken = env.get("SUPERVISOR_TOKEN");

if (!haToken) {
  node.error(
    "SUPERVISOR_TOKEN not configured. Ensure the add-on provides it.",
    msg,
  );
  node.status({ fill: "red", shape: "ring", text: "No Supervisor token" });
  return null;
}

// Store base URL and headers for subsequent HTTP requests
msg.haBaseUrl = haBaseUrl;
msg.headers = {
  Authorization: `Bearer ${haToken}`,
  "Content-Type": "application/json",
};

// Set URL for first API call
msg.url = `${haBaseUrl}/api/states`;

// Read RV info from flow context
const rvInfo = flow.get("rvInfo") || {};
msg.rvInfo = {
  manufacturer: rvInfo.rv_manufacturer || "Unknown",
  model: rvInfo.rv_model || "Unknown",
  year: rvInfo.rv_year || "Unknown",
  other: rvInfo.rv_other || "Unknown",
};

return msg;
