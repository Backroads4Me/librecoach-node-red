// Validates incoming import JSON and prepares HA states request
// Input: msg.payload = parsed JSON body from POST /librecoach/import
// Output 1: valid → msg configured for GET /api/states (with msg.importConfig)
// Output 2: error → msg.payload = error JSON for HTTP Response

const data = msg.payload;

if (!data || typeof data !== "object") {
  msg.payload = { error: "Invalid request: expected a JSON object." };
  msg.statusCode = 400;
  return [null, msg];
}

if (!data.entities || typeof data.entities !== "object") {
  msg.payload = { error: "Invalid file: missing 'entities' key." };
  msg.statusCode = 400;
  return [null, msg];
}

const haBaseUrl = "http://supervisor/core";
const haToken = env.get("SUPERVISOR_TOKEN");

if (!haToken) {
  msg.payload = {
    error: "Server configuration error: no Supervisor token available.",
  };
  msg.statusCode = 500;
  return [null, msg];
}

const allEntities = Object.values(data.entities);
const customized = [];
let skippedUnchanged = 0;

for (const entity of allEntities) {
  if (
    entity.friendly_name &&
    entity.original_name &&
    entity.friendly_name !== entity.original_name
  ) {
    customized.push({
      entity_id: entity.entity_id,
      friendly_name: entity.friendly_name,
    });
  } else {
    skippedUnchanged++;
  }
}

msg.importConfig = {
  customized: customized,
  skippedUnchanged: skippedUnchanged,
  totalInFile: allEntities.length,
};

msg.url = `${haBaseUrl}/api/states`;
msg.method = "GET";
msg.headers = {
  Authorization: `Bearer ${haToken}`,
  "Content-Type": "application/json",
};
msg.payload = "";

node.status({
  fill: "blue",
  shape: "dot",
  text: `${customized.length} customized of ${allEntities.length}`,
});

return [msg, null];
