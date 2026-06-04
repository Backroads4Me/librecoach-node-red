// Prepares persistent notification for entity list export
// Input: msg with msg.exportFilename, msg.entityCount, and (per variant)
//        msg.downloadPage, msg.notificationId, msg.notifyTitle
// Output: msg.payload configured for notify_user

const filename = msg.exportFilename || "librecoach_dashboard_prompt.txt";
const downloadPage = msg.downloadPage || "librecoach_download_dashboard.html";
const haBaseUrl = env.get("HA_BASE_URL") || "http://homeassistant.local:8123";
const downloadUrl = `${haBaseUrl}/local/${downloadPage}`;

msg.payload = {
  title: msg.notifyTitle || "LibreCoach AI Dashboard Prompt",
  message: `<a href="${downloadUrl}" target="_blank">Download ${filename} (${msg.entityCount || "?"} entities)</a><br><br>Upload the file to your AI, then type:<br><b>Read the attached file and create a Home Assistant dashboard following all instructions in the file.</b>`,
  notification_id: msg.notificationId || "librecoach_export_entities",
  data: { filename },
};

node.status({ fill: "green", shape: "dot", text: "Notification prepared" });
return msg;
