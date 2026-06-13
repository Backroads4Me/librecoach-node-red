// HA Status Publisher for proprietary wireless panel signal messages.
// Self-creating: publishes MQTT discovery on first valid reading per panel instance.
// Handles:
// - WIRELESS_PANEL_SIGNAL_STATUS (BF00): signal strength candidate sensor
// - WIRELESS_PANEL_QUALITY_STATUS (1AA00): quality bucket sensor
// Output 1: MQTT messages (discovery + state)

if (!msg.payload || typeof msg.payload !== "object") {
    return null;
}

const p = msg.payload;
const instance = p.instance;
const dgnName = p.dgn_name;

if (typeof instance !== "number" || instance < 1 || instance > 250) {
    return null;
}

if (
    dgnName !== "WIRELESS_PANEL_SIGNAL_STATUS" &&
    dgnName !== "WIRELESS_PANEL_QUALITY_STATUS"
) {
    return null;
}

const messages = [];
const componentType = "sensor";
const CREATED_KEY = "panelSignalCreated";
const created = flow.get(CREATED_KEY) || {};
const device = {
    identifiers: ["librecoach-panels"],
    name: "Panels",
    manufacturer: "LibreCoach",
};

function ensureDiscovery(entityId, config) {
    if (created[entityId]) {
        return;
    }

    messages.push({
        topic: `homeassistant/${componentType}/${entityId}/config`,
        payload: config,
    });

    created[entityId] = true;
}

if (dgnName === "WIRELESS_PANEL_SIGNAL_STATUS") {
    const signal = p.wireless_strength_candidate_dbm;

    if (typeof signal === "number") {
        const entityId = `panel_${instance}_signal_strength`;
        const stateTopic = `homeassistant/${componentType}/${entityId}/state`;

        ensureDiscovery(entityId, {
            name: `Panel ${instance} Signal Strength`,
            unique_id: entityId,
            default_entity_id: `sensor.${entityId}`,
            icon: "mdi:signal",
            state_topic: stateTopic,
            unit_of_measurement: "dBm",
            state_class: "measurement",
            entity_category: "diagnostic",
            value_template: "{{ value | float | round(2) }}",
            availability_mode: "all",
            availability: [
              { topic: "librecoach/nodered/status", payload_available: "online", payload_not_available: "offline" },
              { topic: "can/status", value_template: "{{ 'online' if value == 'online' else 'offline' }}", payload_available: "online", payload_not_available: "offline" },
            ],
            device,
        });

        messages.push({
            topic: stateTopic,
            payload: signal,
        });
    }
}

if (dgnName === "WIRELESS_PANEL_QUALITY_STATUS") {
    const quality = p.quality_bucket_raw;

    if (typeof quality === "number") {
        const entityId = `panel_${instance}_signal_quality`;
        const stateTopic = `homeassistant/${componentType}/${entityId}/state`;

        ensureDiscovery(entityId, {
            name: `Panel ${instance} Signal Quality`,
            unique_id: entityId,
            default_entity_id: `sensor.${entityId}`,
            icon: "mdi:wifi-strength-2",
            state_topic: stateTopic,
            entity_category: "diagnostic",
            value_template: "{{ value | int }}",
            availability_mode: "all",
            availability: [
              { topic: "librecoach/nodered/status", payload_available: "online", payload_not_available: "offline" },
              { topic: "can/status", value_template: "{{ 'online' if value == 'online' else 'offline' }}", payload_available: "online", payload_not_available: "offline" },
            ],
            device,
        });

        messages.push({
            topic: stateTopic,
            payload: quality,
        });
    }
}

if (messages.length === 0) {
    return null;
}

flow.set(CREATED_KEY, created);

return [messages];
