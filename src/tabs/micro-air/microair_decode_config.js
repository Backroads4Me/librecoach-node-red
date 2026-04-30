// Decode MicroAir Zone Config
// Input: MQTT message from librecoach/ble/microair/{mac}/zone/{z}/config
// Caches config in persistent global context and triggers re-discovery

const topic = msg.topic;
if (!topic) return null;

const parts = topic.split("/");
// Expecting: librecoach/ble/microair/{mac}/zone/{z}/config
if (parts.length < 7) return null;

const mac = parts[3];
const zone = parseInt(parts[5]);
const safeMac = mac.replace(/:/g, "_");

let config;
if (typeof msg.payload === "string") {
    try {
        config = JSON.parse(msg.payload);
    } catch (e) {
        return null;
    }
} else {
    config = msg.payload;
}

if (!config) return null;

// Cache config in persistent global context
const configKey = `microair_${safeMac}_zone_${zone}_config`;
global.set(configKey, config, "file");

// Build a standardized message for microair_unique to trigger re-discovery
msg.payload = {
    mac: mac,
    zone: zone,
    config_updated: true,
};

return msg;
