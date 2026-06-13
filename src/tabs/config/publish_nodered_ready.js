// Publishes the retained readiness flag after LibreCoach flows have loaded.
// The orchestrator (run.sh wait_for_nodered_api) blocks on this retained
// topic before continuing startup; it clears the topic before any Node-RED
// (re)start so a stale flag from a previous run can never satisfy the wait.
// Input: startup inject (delayed so MQTT subscriptions are registered)
// Output: retained messages via "MQTT Out: Retain TRUE"
const now = new Date().toISOString();
const version = global.get("librecoach_version") || "unknown";

return [[
  {
    topic: "librecoach/nodered/status",
    payload: "online",
  },
  {
    topic: "librecoach/nodered/ready",
    payload: JSON.stringify({
      ready: true,
      version,
      updated_at: now,
    }),
  },
]];
