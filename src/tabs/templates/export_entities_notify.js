// Prepares persistent notification for entity list export
// Input: msg with msg.exportFilename, msg.entityCount
// Output: msg.payload configured for notify_user

const filename = msg.exportFilename || "librecoach_entities.txt";
const haBaseUrl = env.get("HA_BASE_URL") || "http://homeassistant.local:8123";
const downloadUrl = `${haBaseUrl}/local/librecoach_download_entities.html`;

msg.payload = {
  title: "LibreCoach Entity List Ready",
  message: `<a href="${downloadUrl}" target="_blank">Download ${filename} (${msg.entityCount || "?"} entities)</a>`,
  notification_id: "librecoach_export_entities",
  data: { filename },
};

node.status({ fill: "green", shape: "dot", text: "Notification prepared" });
return msg;
