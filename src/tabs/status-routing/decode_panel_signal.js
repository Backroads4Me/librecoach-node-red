// Decoder for proprietary wireless panel signal messages.
// Handles two coach-specific DGNs observed in the field:
// - BF00h: per-panel live RF metric, likely raw signal strength
// - 1AA00h: per-panel coarse signal-quality companion, likely display bars/state

function toSigned8(value) {
    return value > 127 ? value - 256 : value;
}

function toUint16LE(lowByte, highByte) {
    return lowByte | (highByte << 8);
}

function toSigned16(value) {
    return value > 32767 ? value - 65536 : value;
}

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

if (dgn !== "BF00" && dgn !== "1AA00") {
    node.warn(`[decode_panel_signal] Unexpected DGN: ${dgn}`);
    return null;
}

const d = data_payload.match(/.{1,2}/g).map((b) => parseInt(b, 16));
if (d.some(isNaN)) {
    node.warn("Invalid hex in data_payload");
    return null;
}

const instance = d[0];

if (dgn === "BF00") {
    const metricByte1Raw = d[1];
    const metricByte2Raw = d[2];
    const metricByte1Signed = toSigned8(metricByte1Raw);
    const metricUint16 = toUint16LE(metricByte1Raw, metricByte2Raw);
    const metricInt16 = toSigned16(metricUint16);
    const metricInt16Div100 = parseFloat((metricInt16 / 100).toFixed(2));

    let likelyEncoding = "unknown";
    let wireless_strength_candidate_dbm = null;

    if (metricByte2Raw === 0xff) {
        likelyEncoding = "signed_int8_dbm_candidate";
        wireless_strength_candidate_dbm = metricByte1Signed;
    } else if (metricByte2Raw >= 0xe0 && metricByte2Raw <= 0xef) {
        likelyEncoding = "signed_int16_le_div100_dbm_candidate";
        wireless_strength_candidate_dbm = metricInt16Div100;
    }

    msg.payload = {
        ...incomingPayload,
        dgn_name: "WIRELESS_PANEL_SIGNAL_STATUS",
        instance,
        signal_metric_byte_1_raw: metricByte1Raw,
        signal_metric_byte_1_signed: metricByte1Signed,
        signal_metric_byte_2_raw: metricByte2Raw,
        signal_metric_uint16_le_raw: metricUint16,
        signal_metric_int16_le_signed: metricInt16,
        signal_metric_int16_le_div100: metricInt16Div100,
        likely_encoding: likelyEncoding,
        wireless_strength_candidate_dbm,
        reserved_byte_3_raw: d[3],
        reserved_byte_4_raw: d[4],
        reserved_byte_5_raw: d[5],
        reserved_byte_6_raw: d[6],
        reserved_byte_7_raw: d[7],
    };

    return msg;
}

const qualityRaw = d[2];

msg.payload = {
    ...incomingPayload,
    dgn_name: "WIRELESS_PANEL_QUALITY_STATUS",
    instance,
    status_byte_1_raw: d[1],
    quality_bucket_raw: qualityRaw,
    quality_bucket_high_nibble: (qualityRaw >> 4) & 0x0f,
    quality_bucket_low_nibble: qualityRaw & 0x0f,
    likely_meaning: "quantized_signal_quality_candidate",
    status_byte_3_raw: d[3],
    reserved_byte_4_raw: d[4],
    reserved_byte_5_raw: d[5],
    reserved_byte_6_raw: d[6],
    reserved_byte_7_raw: d[7],
};

return msg;
