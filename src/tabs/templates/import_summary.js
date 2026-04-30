// Summarizes import results after all entity registry updates complete
// Input: msg.payload = array of ha-api WebSocket responses (from Join after Split)
//        msg.importCounts = { totalInFile, skippedUnchanged, skippedMissing, toUpdate }
// Output 1: msg configured for HA persistent notification
// Output 2: JSON result for HTTP Response to browser

msg.res = msg._originalRes;
delete msg._originalRes;

const responses = Array.isArray(msg.payload) ? msg.payload : [msg.payload];
const counts = msg.importCounts || {};

let updated = 0;
let failed = 0;

for (const res of responses) {
    if (res && res.entity_id) {
        updated++;
    } else {
        failed++;
    }
}

const skipped = (counts.skippedUnchanged || 0) + (counts.skippedMissing || 0);

// Output 2: HTTP Response to browser
const httpMsg = {
    payload: { updated, skipped, failed },
    statusCode: 200,
    res: msg.res,
};

// Output 1: HA persistent notification
const haBaseUrl = "http://supervisor/core";
const haToken = env.get("SUPERVISOR_TOKEN");

let notifyMsg = null;

if (haToken) {
    notifyMsg = {
        url: `${haBaseUrl}/api/services/persistent_notification/create`,
        method: "POST",
        headers: {
            Authorization: `Bearer ${haToken}`,
            "Content-Type": "application/json",
        },
        payload: {
            title: "LibreCoach Import Complete",
            message: `Updated: ${updated}\nSkipped: ${skipped}\nFailed: ${failed}`,
            notification_id: "librecoach_import_result",
        },
    };
}

node.status({
    fill: failed > 0 ? "yellow" : "green",
    shape: "dot",
    text: `${updated} updated, ${skipped} skipped, ${failed} failed`,
});

return [notifyMsg, httpMsg];
