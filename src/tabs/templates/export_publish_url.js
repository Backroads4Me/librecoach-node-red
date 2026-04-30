// Writes export config and download page to /homeassistant/www/
// Input: msg.exportConfig (object from Build Export Config)
//        msg.exportFilename (dynamic filename from export_ha_config)
// Output: two messages to File Write node (JSON export + HTML download page)

if (!msg.exportConfig) {
    node.error("Missing exportConfig object", msg);
    return null;
}

const entityCount = Object.keys(msg.exportConfig.entities || {}).length;
const filename = msg.exportFilename || "librecoach_config.json";

// Message 1: the JSON export file
const jsonMsg = {
    filename: `/homeassistant/www/${filename}`,
    payload: JSON.stringify(msg.exportConfig, null, 2),
    entityCount: entityCount,
    exportFilename: filename,
};

// Message 2: HTML download page that auto-triggers the file download
const htmlMsg = {
    filename: "/homeassistant/www/librecoach_download.html",
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
    entityCount: entityCount,
    exportFilename: filename,
};

return [[jsonMsg, htmlMsg]];
