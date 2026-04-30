// Serves the LibreCoach configuration import upload page
// Input: HTTP In GET /librecoach/import
// Output: msg.payload = HTML string for HTTP Response

msg.payload = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LibreCoach — Import Configuration</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #1a1a2e; color: #e0e0e0; padding: 2rem;
    display: flex; justify-content: center; min-height: 100vh;
  }
  .container { max-width: 560px; width: 100%; }
  h1 { color: #4fc3f7; margin-bottom: 0.5rem; font-size: 1.5rem; }
  .subtitle { color: #888; margin-bottom: 1.5rem; font-size: 0.9rem; }
  .upload-area {
    border: 2px dashed #444; border-radius: 8px; padding: 2rem;
    text-align: center; margin-bottom: 1rem; transition: border-color 0.2s;
  }
  .upload-area.has-file { border-color: #4fc3f7; }
  input[type="file"] { margin: 0.5rem 0; }
  .preview {
    background: #16213e; border-radius: 8px; padding: 1rem;
    margin-bottom: 1rem; display: none;
  }
  .preview.visible { display: block; }
  .preview h3 { color: #4fc3f7; margin-bottom: 0.5rem; font-size: 1rem; }
  .preview-row { display: flex; justify-content: space-between; padding: 0.25rem 0; }
  .preview-label { color: #888; }
  .preview-value { color: #e0e0e0; font-weight: 500; }
  .error-text { color: #ef5350; }
  button {
    background: #4fc3f7; color: #1a1a2e; border: none; border-radius: 6px;
    padding: 0.75rem 1.5rem; font-size: 1rem; font-weight: 600;
    cursor: pointer; width: 100%; transition: opacity 0.2s;
  }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  button:hover:not(:disabled) { opacity: 0.85; }
  .results {
    background: #16213e; border-radius: 8px; padding: 1rem;
    margin-top: 1rem; display: none;
  }
  .results.visible { display: block; }
  .results h3 { margin-bottom: 0.5rem; font-size: 1rem; }
  .results.success h3 { color: #66bb6a; }
  .results.failure h3 { color: #ef5350; }
  .spinner { display: inline-block; width: 18px; height: 18px;
    border: 2px solid #4fc3f7; border-top-color: transparent;
    border-radius: 50%; animation: spin 0.8s linear infinite;
    vertical-align: middle; margin-right: 0.5rem;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div class="container">
  <h1>Import Configuration</h1>
  <p class="subtitle">Restore customized entity names from a LibreCoach export file.</p>

  <div class="upload-area" id="uploadArea">
    <p>Select a LibreCoach export JSON file</p>
    <input type="file" id="fileInput" accept=".json">
  </div>

  <div class="preview" id="preview">
    <h3>File Preview</h3>
    <div id="previewContent"></div>
  </div>

  <button id="importBtn" disabled>Import</button>

  <div class="results" id="results">
    <h3 id="resultsTitle"></h3>
    <div id="resultsContent"></div>
  </div>
</div>

<script>
  const importPostUrl = window.location.href;
  const fileInput = document.getElementById("fileInput");
  const uploadArea = document.getElementById("uploadArea");
  const preview = document.getElementById("preview");
  const previewContent = document.getElementById("previewContent");
  const importBtn = document.getElementById("importBtn");
  const results = document.getElementById("results");
  const resultsTitle = document.getElementById("resultsTitle");
  const resultsContent = document.getElementById("resultsContent");

  let parsedConfig = null;

  fileInput.addEventListener("change", function () {
    const file = this.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.entities || typeof data.entities !== "object") {
          showPreviewError("Invalid file: missing 'entities' key.");
          return;
        }

        parsedConfig = data;
        const entityCount = Object.keys(data.entities).length;

        let html = "";
        html += row("Export Date", data.export_date || "Unknown");
        if (data.rv_info) {
          const rv = data.rv_info;
          const rvLabel = [rv.manufacturer, rv.model, rv.year, rv.other]
            .filter(Boolean).join(" ");
          if (rvLabel) html += row("Vehicle", rvLabel);
        }
        html += row("Customized Names", entityCount);
        if (entityCount === 0) {
          html += '<p class="error-text" style="margin-top:0.5rem">' +
                  "No customized names found — nothing to import.</p>";
        }

        previewContent.innerHTML = html;
        preview.classList.add("visible");
        uploadArea.classList.add("has-file");
        importBtn.disabled = entityCount === 0;
        results.classList.remove("visible");
      } catch (err) {
        showPreviewError("Could not parse JSON: " + err.message);
      }
    };
    reader.readAsText(file);
  });

  function showPreviewError(msg) {
    previewContent.innerHTML = '<p class="error-text">' + msg + "</p>";
    preview.classList.add("visible");
    importBtn.disabled = true;
    parsedConfig = null;
  }

  function row(label, value) {
    return '<div class="preview-row">' +
           '<span class="preview-label">' + label + "</span>" +
           '<span class="preview-value">' + value + "</span></div>";
  }

  importBtn.addEventListener("click", function () {
    if (!parsedConfig) return;
    importBtn.disabled = true;
    importBtn.innerHTML = '<span class="spinner"></span>Importing…';
    results.classList.remove("visible", "success", "failure");

    fetch(importPostUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsedConfig),
    })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      resultsTitle.textContent = data.error ? "Import Failed" : "Import Complete";
      results.classList.add(data.error ? "failure" : "success");

      if (data.error) {
        resultsContent.innerHTML = '<p class="error-text">' + data.error + "</p>";
      } else {
        let html = "";
        html += row("Updated", data.updated || 0);
        html += row("Skipped (not in HA)", data.skipped || 0);
        html += row("Failed", data.failed || 0);
        resultsContent.innerHTML = html;
      }
      results.classList.add("visible");
    })
    .catch(function (err) {
      resultsTitle.textContent = "Import Failed";
      results.classList.add("failure", "visible");
      resultsContent.innerHTML = '<p class="error-text">' + err.message + "</p>";
    })
    .finally(function () {
      importBtn.innerHTML = "Import";
      importBtn.disabled = false;
    });
  });
</script>
</body>
</html>`;

msg.headers = { "Content-Type": "text/html" };
node.status({ fill: "green", shape: "dot", text: "Page served" });

return msg;
