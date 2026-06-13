// Publishes the retained readiness flag after LibreCoach flows have loaded.
// The orchestrator (run.sh wait_for_nodered_api) blocks on this retained
// topic before continuing startup; it clears the topic before any Node-RED
// (re)start so a stale flag from a previous run can never satisfy the wait.
// Input: startup inject (delayed so MQTT subscriptions are registered)
// Output: retained message via "MQTT Out: Retain TRUE"
msg.topic = "librecoach/nodered/ready";
msg.payload = "online";
return msg;
