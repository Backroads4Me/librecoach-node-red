// Request the current Home Assistant entity registry over the existing
// node-red-contrib-home-assistant-websocket connection.

msg.payload = {
  protocol: "websocket",
  data: { type: "config/entity_registry/list" },
};
return msg;
