// HA Status Publisher for DC Load (DGN 1FFBDh, §6.23.2)
// Self-creating: publishes MQTT discovery on first valid reading per instance.
// Output 1: MQTT messages (discovery + state)
// Entity naming: switch_l_N (routing key "switch_l"), "Switches" device.

if (!msg.payload || typeof msg.payload !== "object") {
    return null;
}

const p = msg.payload;
const instance = p.instance;

if (typeof instance !== "number" || instance < 1 || instance > 250) {
    return null;
}

const opStatus = p.operating_status;
if (opStatus === undefined || opStatus === "Not Available") {
    return null;
}

// Dimmable detection
const dimmableLights = global.get("dimmableLights", "file") || [];
let isDimmable = dimmableLights.includes(instance);
let needsRecreate = false;

function markDimmable() {
    if (!isDimmable) {
        dimmableLights.push(instance);
        global.set("dimmableLights", dimmableLights, "file");
        isDimmable = true;
        needsRecreate = true;
    }
}

// Detect dimmable via spec bit
if (p.variable_level_capability === true) {
    markDimmable();
}

// Determine state and brightness
let haStatus;
let brightness;

if (typeof opStatus === "number") {
    haStatus = opStatus > 0 ? "ON" : "OFF";
    brightness = opStatus;

    // Detect dimmable via operating status range (1-99%)
    if (opStatus > 0 && opStatus < 100) {
        markDimmable();
    }
} else if (opStatus === "Load Delay Active") {
    haStatus = "ON";
} else {
    return null;
}

// Entity identifiers — switch_l_N distinguishes from DC_DIMMER's switch_N
const entityId = `switch_l_${instance}`;
const stateTopic = `homeassistant/light/${entityId}/state`;
const commandTopic = `homeassistant/light/${entityId}/set`;

const messages = [];

// Self-creating discovery: publish config on first valid reading
const CREATED_KEY = "dcLoadCreated";
const created = flow.get(CREATED_KEY) || {};

if (!created[instance] || needsRecreate) {
    const config = {
        name: `Switch ${instance}`,
        unique_id: entityId,
        default_entity_id: `light.${entityId}`,
        icon: "mdi:light-recessed",
        schema: "json",
        command_topic: commandTopic,
        state_topic: stateTopic,
        device: {
            identifiers: ["librecoach-switches"],
            name: "Switches",
            manufacturer: "LibreCoach",
        },
    };

    if (isDimmable) {
        config.brightness = true;
        config.brightness_scale = 100;
        config.supported_color_modes = ["brightness"];
    } else {
        config.supported_color_modes = ["onoff"];
    }

    messages.push({
        topic: `homeassistant/light/${entityId}/config`,
        payload: config,
    });

    created[instance] = true;
    flow.set(CREATED_KEY, created);
}

// Store last brightness for dimmable recall on toggle
if (isDimmable && typeof brightness === "number" && brightness > 0) {
    global.set("dimmerBrightness_" + instance, brightness, "file");
}

// Build JSON state payload
const stateObj = { state: haStatus };

if (haStatus === "ON") {
    if (isDimmable) {
        stateObj.color_mode = "brightness";
        if (brightness !== undefined) {
            stateObj.brightness = brightness;
        }
    } else {
        stateObj.color_mode = "onoff";
    }
}

messages.push({
    topic: stateTopic,
    payload: JSON.stringify(stateObj),
});

return [messages];
