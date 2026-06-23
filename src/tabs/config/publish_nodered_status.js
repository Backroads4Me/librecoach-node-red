// Publishes the retained online status after LibreCoach flows have loaded.
// Input: startup inject (delayed so MQTT subscriptions are registered)
// Output: retained message via "MQTT Out: Retain TRUE"
return [[
  {
    topic: "librecoach/nodered/status",
    payload: "online",
  },
]];