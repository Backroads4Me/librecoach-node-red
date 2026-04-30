// Export Unknown CAN Recording
// Reads recordUnknownLog from global context
// Output: [[jsonMsg, htmlMsg], notifyMsg] to File Write node

const TIMEZONE = "America/New_York";

function getLocalISO(ms) {
  if (!ms) return null;
  return new Date(ms)
    .toLocaleString("sv-SE", { timeZone: TIMEZONE, hour12: false })
    .replace(" ", "T");
}

const log = global.get("recordUnknownLog", "file") || [];
const startTime = global.get("recordUnknownStart", "file");

const report = {
  recording_start: getLocalISO(startTime),
  recording_end: log.length > 0 ? log[log.length - 1].timestamp : null,
  message_count: log.length,
  messages: log,
};

// Static filename replaces old files every time
const filename = "librecoach_unknown_recording.json";

const jsonMsg = {
  filename: `/homeassistant/www/${filename}`,
  payload: JSON.stringify(report, null, 2),
};

const htmlMsg = {
  filename: "/homeassistant/www/librecoach_download_recording.html",
  payload: `<!DOCTYPE html>
<html><head><title>LibreCoach Download</title></head>
<body>
<script>
var a = document.createElement("a");
a.href = "/local/${filename}";
a.download = "${filename}";
document.body.appendChild(a);
a.click();
setTimeout(function() { window.close(); }, 1000);
</script>
<p>Your download should start automatically. If not, <a href="/local/${filename}" download="${filename}">click here</a>.</p>
</body></html>`,
};

const notifyMsg = {
  payload: {
    title: "LibreCoach Unknown Recording",
    message: `Your recording is ready.<br><a href="/local/librecoach_download_recording.html" target="_blank"><b>Click here to download</b></a>.`,
    notification_id: "librecoach_export_unknown",
  },
};

node.status({
  fill: "green",
  shape: "dot",
  text: `Exported ${log.length} messages`,
});

return [[jsonMsg, htmlMsg], notifyMsg];
