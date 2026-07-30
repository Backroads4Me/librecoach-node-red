// Preserve the entity registry result, then obtain current states through the
// add-on's existing Supervisor API credentials.

if (!Array.isArray(msg.payload)) {
  node.error("Entity registry response is not an array", msg);
  return null;
}

const token = env.get("SUPERVISOR_TOKEN");
if (!token) {
  node.error("SUPERVISOR_TOKEN is unavailable", msg);
  return null;
}

msg.entityRegistry = msg.payload;
msg.method = "GET";
msg.url = "http://supervisor/core/api/states";
msg.headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};
msg.payload = "";
return msg;
