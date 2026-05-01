// Writes entity list and HTML download page to /homeassistant/www/
// Input: msg.payload = rendered string from POST /api/template
// Output: two messages to File Write node (text file + HTML download page)

const content = msg.payload;
if (!content || typeof content !== "string") {
  node.error("Invalid response from /api/template — expected rendered string", msg);
  node.status({ fill: "red", shape: "ring", text: "Template render failed" });
  return null;
}

const filename = "librecoach_entities.txt";
const lineCount = content.split("\n").filter((l) => l.trim() && !l.startsWith("AREA")).length;

const textMsg = {
  filename: `/homeassistant/www/${filename}`,
  payload: content,
  entityCount: lineCount,
  exportFilename: filename,
};

const htmlMsg = {
  filename: "/homeassistant/www/librecoach_download_entities.html",
  payload: `<!DOCTYPE html>
<html><head><title>LibreCoach Entity List</title></head>
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
  entityCount: lineCount,
  exportFilename: filename,
};

node.status({ fill: "green", shape: "dot", text: `${lineCount} entities` });
return [[textMsg, htmlMsg]];
