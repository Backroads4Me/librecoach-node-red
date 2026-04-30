// HA Status Publisher for Shade (WINDOW_SHADE_STATUS, §6.40)
// Self-creating: publishes MQTT discovery on first valid reading per instance.
// Output 1: MQTT messages (discovery + state)

if (!msg.payload || typeof msg.payload !== "object") {
    return null;
}

const p = msg.payload;
const instance = p.instance;

if (typeof instance !== "number" || instance < 1 || instance > 250) {
    return null;
}

const motorStatus = p.motor_status;
const forwardStatus = p.forward_status;
const reverseStatus = p.reverse_status;

let haState, position;

if (motorStatus === 1 && forwardStatus === 1) {
    haState = "opening";
    position = 50;
} else if (motorStatus === 1 && reverseStatus === 1) {
    haState = "closing";
    position = 50;
} else {
    // Motor stopped — report as open with 50% to keep both buttons active
    haState = "open";
    position = 50;
}

const entityId = `shade_${instance}`;
const componentType = "cover";
const stateTopic = `homeassistant/${componentType}/${entityId}/state`;

const messages = [];

// Self-creating discovery: publish config on first valid reading
const CREATED_KEY = "shadeCreated";
const created = flow.get(CREATED_KEY) || {};

if (!created[instance]) {
    messages.push({
        topic: `homeassistant/${componentType}/${entityId}/config`,
        payload: {
            name: `Shade ${instance}`,
            unique_id: entityId,
            default_entity_id: `${componentType}.${entityId}`,
            icon: "mdi:window-shutter",
            command_topic: `homeassistant/${componentType}/${entityId}/set`,
            state_topic: stateTopic,
            position_topic: stateTopic,
            payload_open: "OPEN",
            payload_close: "CLOSE",
            payload_stop: "STOP",
            state_opening: "opening",
            state_closing: "closing",
            state_open: "open",
            state_closed: "closed",
            value_template: "{{ value_json.state }}",
            position_template: "{{ value_json.position | int }}",
            optimistic: false,
            device: {
                identifiers: ["librecoach-shades"],
                name: "Shades",
                manufacturer: "LibreCoach",
            },
        },
    });

    created[instance] = true;
    flow.set(CREATED_KEY, created);
}

// State update (JSON for state + position)
messages.push({
    topic: stateTopic,
    payload: JSON.stringify({ state: haState, position: position }),
});

return [messages];
