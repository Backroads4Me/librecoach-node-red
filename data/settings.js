/******************************************************************************
 * LibreCoach Node-RED Settings
 *
 * - Home Assistant OS compatible
 * - Uses Home Assistant login
 * - Persistent flows and MQTT credentials
 * - Minimal configuration
 ******************************************************************************/

module.exports = {
  // Flow file and credentials
  flowFile: "flows.json",
  credentialSecret: "librecoach", // Key to encrypt credentials
  flowFilePretty: true, // Pretty-print JSON for easier reading

  // Context storage
  contextStorage: {
    default: "memoryOnly", // Fast ephemeral storage
    memoryOnly: { module: "memory" },
    file: { module: "localfilesystem", config: { dir: "/share/.librecoach" } }, // Persistent across add-on reinstalls
  },

  // Expose the deployed Node-RED project version to Function nodes.
  functionGlobalContext: {
    librecoach_version: require("./package.json").version,
  },

  // Editor settings
  editorTheme: {
    theme: "dark-modern",
    tours: false,
    projects: { enabled: false, workflow: { mode: "manual" } },
  },
};
