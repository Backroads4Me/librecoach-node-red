// Stores filename and prepares notification payload
// Input: msg from Notify Export Complete (has msg.entityCount, msg.exportFilename)
// Output: msg.payload configured for notify_user

const filename = msg.exportFilename || "librecoach_config.json";

// Store filename in flow context for the download endpoint
flow.set("exportFilename", filename);

const haBaseUrl = env.get("HA_BASE_URL") || "http://homeassistant.local:8123";
const downloadUrl = `${haBaseUrl}/local/librecoach_download.html`;

msg.payload = {
  title: "LibreCoach Export Complete",
  message: `<a href="${downloadUrl}" target="_blank">Download ${filename}</a>`,
  notification_id: "librecoach_export",
  data: {
    filename: filename
  }
};

node.status({
  fill: "green",
  shape: "dot",
  text: "Notification prepared",
});

return msg;
