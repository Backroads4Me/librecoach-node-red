// Output 1: Victron keepalive (-> "Victron out")
// Output 2: derived availability status (-> "MQTT out: Retain TRUE")
const victronEnabled = global.get("victronEnabled");
if (!victronEnabled) return null;

// --- Keepalive (output 1) ---
const portalId = global.get("victronPortalId", "file");
let keepaliveMsg = null;
if (portalId) {
    keepaliveMsg = {
        topic: `R/${portalId}/keepalive`,
        payload: { "keepalive-options": ["suppress-republish"] },
    };
}

// --- Availability watchdog (output 2) ---
// Venus OS publishes no online/offline topic, so derive one from data freshness.
// victron_decode_mqtt stamps victronLastSeen on every inbound N/+/# message.
// STALE_MS spans ~3 keepalive cycles so a single missed publish won't flap.
const STALE_MS = 90000;
const lastSeen = global.get("victronLastSeen") || 0;
const fresh = lastSeen > 0 && Date.now() - lastSeen < STALE_MS;
const desired = fresh ? "online" : "offline";

let statusMsg = null;
if (desired !== context.get("victronStatusPublished")) {
    context.set("victronStatusPublished", desired);
    statusMsg = {
        topic: "librecoach/victron/status",
        payload: desired,
        retain: true,
    };
}

return [keepaliveMsg, statusMsg];
