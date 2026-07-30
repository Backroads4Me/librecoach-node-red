// Home Assistant client events are emitted through the Events: all node. Only
// a ready/running transition requests a snapshot; disconnects and retries do
// not publish an incomplete map.

const event = msg.payload?.event ||
  msg.payload?.event_type ||
  msg.payload?.type ||
  msg.payload;
const ready = new Set(["connected", "states_loaded", "running"]);
if (!ready.has(String(event))) return null;

msg.topic = "entity-map-refresh";
msg.payload = { reason: "home-assistant-ready", event: String(event) };
return msg;
