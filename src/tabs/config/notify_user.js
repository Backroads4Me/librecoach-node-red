// Centralized Notification Handler
// Input: msg.payload with { title, message, notification_id }
// Output: msg configured for HTTP Request to HA notification service

const haBaseUrl = "http://supervisor/core";
const haToken = env.get("SUPERVISOR_TOKEN");

if (!haToken) {
    node.warn("No Supervisor token - skipping notification");
    return null;
}

const payload = msg.payload || {};

if (!payload.title || !payload.message) {
    node.warn("Notification missing title or message");
    return null;
}

msg.url = `${haBaseUrl}/api/services/persistent_notification/create`;
msg.method = "POST";
msg.headers = {
    Authorization: `Bearer ${haToken}`,
    "Content-Type": "application/json",
};

msg.payload = {
    title: payload.title,
    message: payload.message,
    notification_id: payload.notification_id || "librecoach_notification",
};

return msg;
