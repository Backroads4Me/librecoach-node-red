/******************************************************************************
 * LibreCoach Node-RED Settings
 *
 * - Home Assistant OS compatible
 * - Uses Home Assistant login
 * - Persistent flows and MQTT credentials
 * - Minimal configuration
 ******************************************************************************/

module.exports = {
  flowFile: "flows.json",
  credentialSecret: "librecoach",
  flowFilePretty: true,

  contextStorage: {
    default: "memoryOnly",
    memoryOnly: { module: "memory" },
    file: { module: "localfilesystem" },
  },

  editorTheme: {
    theme: "dark",
    tours: false,
    projects: { enabled: true, workflow: { mode: "manual" } },
  },
};
