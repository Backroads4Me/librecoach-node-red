const victronEnabled = global.get("victronEnabled");
if (!victronEnabled) return null;

const portalId = msg.payload.value;

// Store the ID in global context (file store — survives restarts)
global.set("victronPortalId", portalId, "file");

node.status({
    fill: "green",
    shape: "dot",
    text: portalId,
});
