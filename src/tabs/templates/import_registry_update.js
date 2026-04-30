// Prepares HA entity registry update for a single entity (runs after Split)
// Input: msg.payload = { entity_id, friendly_name }
// Output: msg configured for ha-api node (WebSocket protocol)

msg._originalRes = msg.res;
delete msg.res;

const entity = msg.payload;

msg.entityId = entity.entity_id;

msg.payload = {
  protocol: "websocket",
  data: {
    type: "config/entity_registry/update",
    entity_id: entity.entity_id,
    name: entity.friendly_name,
  },
};

return msg;
