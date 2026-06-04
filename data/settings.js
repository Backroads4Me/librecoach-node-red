/******************************************************************************
 * LibreCoach Node-RED Settings
 *
 * - Home Assistant OS compatible
 * - Uses Home Assistant login
 * - Persistent flows and MQTT credentials
 * - Minimal configuration
 ******************************************************************************/

process.env.MQTT_USER = "REPLACE_MQTT_USER";
process.env.MQTT_PASS = "REPLACE_MQTT_PASS";

module.exports = {
  // Flow file and credentials
  flowFile: "flows.json",
  credentialSecret: "librecoach", // Key to encrypt credentials
  flowFilePretty: true, // Pretty-print JSON for easier reading

  // Context storage
  contextStorage: {
    default: "memoryOnly", // Fast ephemeral storage
    memoryOnly: { module: "memory" },
    file: { module: "localfilesystem" }, // Persistent storage for flows
  },

  // Editor settings
  editorTheme: {
    theme: "dark",
    tours: false,
    projects: { enabled: false, workflow: { mode: "manual" } },
  },
};
