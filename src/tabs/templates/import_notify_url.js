// Prepares notification payload for Import
// Input: MQTT trigger from librecoach/import/trigger
// Output: msg.payload configured for notify_user

const nrBaseUrl = "http://homeassistant.local:1880";
const importUrl = `${nrBaseUrl}/endpoint/librecoach/import`;

msg.payload = {
  title: "LibreCoach Import",
  message: `Upload a configuration file to restore entity names.\n\n[Open Import Page](${importUrl})`,
  notification_id: "librecoach_import",
};

return msg;
