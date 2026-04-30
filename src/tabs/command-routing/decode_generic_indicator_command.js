// Decoder for GENERIC_INDICATOR_COMMAND (DGN 1FED9h, §6.26.2)
// Input: msg.payload from decode_rvc_can (dgn, dgn_name, data_payload)
// Output: decoded fields merged into payload, or null for unhandled function types.
// Unhandled types are logged to flow context "unknownGenericIndicatorCmd" for future analysis.

if (!msg.payload || typeof msg.payload !== "object") {
    node.warn("Invalid payload: expected object");
    return null;
}

const incomingPayload = msg.payload;
const { dgn, data_payload } = incomingPayload;

if (!dgn || !data_payload) {
    node.warn("Missing required fields: dgn and/or data_payload");
    return null;
}

if (typeof data_payload !== "string" || data_payload.length < 16) {
    node.warn("Invalid data_payload: expected 8-byte hex string");
    return null;
}

const d = data_payload.match(/.{1,2}/g).map((b) => parseInt(b, 16));
if (d.some(isNaN)) {
    node.warn("Invalid hex in data_payload");
    return null;
}

// Byte 0: Instance
// 1-250 = specific instance, 0 = all instances, 255 = no instances (use group)
const instance = d[0];

// Byte 1: Group bitmap
// Bits 0-6 correspond to groups 1-7 (0 bit = command applies to that group)
// Bit 7 must be 0 for a group command; 0xFF = non-group command
const groupRaw = d[1];
const isGroupCommand = (groupRaw & 0x80) === 0;
const groups = [];
if (isGroupCommand) {
    for (let i = 0; i < 7; i++) {
        if ((groupRaw & (1 << i)) === 0) {
            groups.push(i + 1);
        }
    }
}

// Byte 2: Brightness (Table 5.3, 0-200, 0.5% per step)
const brightnessRaw = d[2];
let brightness;
if (brightnessRaw <= 200) {
    brightness = parseFloat((brightnessRaw * 0.5).toFixed(1));
} else if (brightnessRaw === 255) {
    brightness = "Not Available";
} else {
    brightness = "Reserved";
}

// Byte 3 bits 0-3: Bank Select (0-13; 0xF = banking not supported)
const bankSelect = d[3] & 0x0f;

// Byte 4: Duration
const durationRaw = d[4];
let duration;
if (durationRaw === 0) {
    duration = "Momentary";
} else if (durationRaw <= 240) {
    duration = `${durationRaw}s`;
} else if (durationRaw >= 241 && durationRaw <= 250) {
    duration = `${durationRaw - 236}min`;
} else if (durationRaw === 255) {
    duration = "Continuous";
} else {
    duration = "Reserved";
}

// Byte 6: Function
const functionRaw = d[6];
const functionNames = {
    0x00: "Set Brightness",
    0x01: "LED1 Off, LED2 Off",
    0x02: "LED1 On, LED2 Off",
    0x03: "LED1 Off, LED2 On",
    0x04: "LED1 On, LED2 On",
    0x11: "Ramp Brightness",
    0x21: "Flash Alternate",
};
const functionName = functionNames[functionRaw] ?? `Unknown (${functionRaw})`;

// Classification: only pass through function types we currently handle.
// Everything else is logged for future analysis and dropped.
const HANDLED_FUNCTIONS = new Set([
    0x00, // Set Brightness → light on/off/dim
    0x11, // Ramp Brightness → dimmable light
    // 0x01-0x04 (individual LED control) → unknown context until seen in the wild
]);

if (!HANDLED_FUNCTIONS.has(functionRaw)) {
    const log = flow.get("unknownGenericIndicatorCmd") || {};
    if (!log[data_payload]) {
        log[data_payload] = {
            originalMessage: incomingPayload.originalMessage || null,
            data_payload,
            function_raw: functionRaw,
            function: functionName,
            instance,
            group_raw: groupRaw,
            groups,
            brightness_raw: brightnessRaw,
            count: 0,
            first_seen: Date.now(),
        };
    }
    log[data_payload].count++;
    log[data_payload].last_seen = Date.now();
    flow.set("unknownGenericIndicatorCmd", log);
    return null;
}

msg.payload = {
    ...incomingPayload,
    dgn,
    dgn_name: "GENERIC_INDICATOR_COMMAND",
    instance,
    group_raw: groupRaw,
    groups,
    is_group_command: isGroupCommand,
    brightness_raw: brightnessRaw,
    brightness,
    bank_select: bankSelect,
    duration_raw: durationRaw,
    duration,
    function_raw: functionRaw,
    function: functionName,
};

// Persist state + brightness to file store (shared with encoder and optimistic updater)
const haState =
    typeof brightnessRaw === "number" && brightnessRaw <= 200
        ? brightnessRaw > 0
            ? "ON"
            : "OFF"
        : null;

// Resolve entity IDs from the decoded command
const entityTargets = [];
if (instance >= 1 && instance <= 250) {
    entityTargets.push(`switch_i_${instance}`);
} else if (instance === 255 && isGroupCommand) {
    for (const g of groups) {
        entityTargets.push(`switch_g_${g}`);
    }
}

for (const eid of entityTargets) {
    if (haState !== null) {
        global.set("indicatorState_" + eid, haState, "file");
    }
    if (
        haState === "ON" &&
        typeof brightnessRaw === "number" &&
        brightnessRaw > 0
    ) {
        global.set("indicatorBrightness_" + eid, brightnessRaw * 0.5, "file");
    }
}

return msg;
