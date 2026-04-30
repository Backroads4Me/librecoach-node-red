// Decoder for DC_DIMMER_COMMAND_2 (DGN 1FEDBh, §6.22.4)
// Input: msg.payload from decode_rvc_can (dgn, dgn_name, data_payload)
// Output: decoded fields merged into payload (keeps data_payload)

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

if (typeof data_payload !== "string" || data_payload.length < 14) {
    node.warn("Invalid data_payload: expected at least 7-byte hex string");
    return null;
}

// Parse hex string to byte array
const d = [];
for (let i = 0; i < data_payload.length; i += 2) {
    const b = parseInt(data_payload.substring(i, i + 2), 16);
    if (isNaN(b)) {
        node.warn(
            `Invalid hex byte in data_payload: ${data_payload.substring(i, i + 2)}`,
        );
        return null;
    }
    d.push(b);
}

// Byte 0: Instance (1-250 valid)
const instance = d[0];
if (instance < 1 || instance > 250) {
    return null;
}

// Byte 1: Group bitmap
const group = d[1];

// Byte 2: Desired Level (Table 5.3 — 0.5% per step)
const desiredLevelRaw = d[2];
let desired_level;
if (desiredLevelRaw <= 200) {
    desired_level = parseFloat((desiredLevelRaw * 0.5).toFixed(1));
} else if (desiredLevelRaw >= 230 && desiredLevelRaw <= 249) {
    desired_level = `Scene ${desiredLevelRaw - 229}`;
} else if (desiredLevelRaw === 250) {
    desired_level = "Dimmed Memory";
} else if (desiredLevelRaw === 251) {
    desired_level = "Master Memory";
} else if (desiredLevelRaw === 255) {
    desired_level = "Not Available";
} else {
    desired_level = "Reserved";
}

// Byte 3: Command
const commandRaw = d[3];
const commandNames = {
    0x00: "Set Level",
    0x01: "On Duration",
    0x02: "On Delay",
    0x03: "Off Delay",
    0x04: "Stop",
    0x05: "Toggle",
    0x06: "Memory Off",
    0x07: "Save Scene",
    0x0b: "Ramp Brightness",
    0x0c: "Ramp Toggle",
    0x0d: "Ramp Up",
    0x0e: "Ramp Down",
    0x0f: "Ramp Up/Down",
    0x10: "Ramp Up/Down Toggle",
    0x15: "Lock",
    0x16: "Unlock",
    0x1f: "Flash",
    0x20: "Flash Momentary",
};
const command = commandNames[commandRaw] || `Unknown (${commandRaw})`;

// Byte 4: Delay/Duration
const delayRaw = d[4];
let delay_duration;
if (delayRaw === 0) {
    delay_duration = "Immediate";
} else if (delayRaw <= 240) {
    delay_duration = `${delayRaw} seconds`;
} else if (delayRaw >= 241 && delayRaw <= 250) {
    delay_duration = `${delayRaw - 236} minutes`;
} else if (delayRaw === 255) {
    delay_duration = "Continuous";
} else {
    delay_duration = "Reserved";
}

// Byte 5: Interlock (bits 0-1)
const interlockRaw = d[5] & 0x03;
const interlockNames = {
    0: "No Interlock",
    1: "Interlock A",
    2: "Interlock B",
    3: "Reserved",
};
const interlock = interlockNames[interlockRaw];

// Byte 6: Ramp Time (0.1s per step, 0-25s)
const rampRaw = d[6];
let ramp_time;
if (rampRaw === 0) {
    ramp_time = 0;
} else if (rampRaw <= 250) {
    ramp_time = parseFloat((rampRaw * 0.1).toFixed(1));
} else if (rampRaw === 255) {
    ramp_time = "Not Available";
} else {
    ramp_time = "Reserved";
}

const result = {
    dgn: dgn,
    dgn_name: "DC_DIMMER_COMMAND_2",
    instance: instance,
    group: group,
    desired_level_raw: desiredLevelRaw,
    desired_level: desired_level,
    command_raw: commandRaw,
    command: command,
    delay_duration: delay_duration,
    interlock: interlock,
    ramp_time: ramp_time,
};

msg.payload = {
    ...incomingPayload,
    ...result,
};

return msg;
