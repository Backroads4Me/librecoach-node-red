const type = msg.type;
const entityId = msg.entityId;

const discoveryTopic = `homeassistant/${type}/${type}_${entityId}/config`;

msg.topic = discoveryTopic;
msg.payload = "";   // empty payload
msg.retain = true;  // retain so broker overwrites the old config
return msg;