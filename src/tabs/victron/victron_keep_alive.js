const victronEnabled = global.get("victronEnabled");
if (!victronEnabled) return null;

const portalId = global.get("victronPortalId", "file");

if (portalId) {
    msg.topic = `R/${portalId}/keepalive`;

    msg.payload = { "keepalive-options": ["suppress-republish"] };

    return msg;
}
return null;