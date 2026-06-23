// Indexes retained HA discovery configs by integration prefix so disable
// handlers can delete an integration's entities.
// Input: retained messages on homeassistant/+/+/config

const PREFIXES = ["victron", "microair", "hughes"];

const topic = msg.topic;
if (typeof topic !== "string" || !topic.startsWith("homeassistant/")) return null;

const index = global.get("discoveryIndex", "file") || {};

// Empty payload = entity removed; drop the topic from every bucket.
const raw = msg.payload;
const isEmpty =
    raw === "" ||
    raw === null ||
    raw === undefined ||
    (typeof raw === "object" && Object.keys(raw).length === 0);

if (isEmpty) {
    let changed = false;
    for (const p of PREFIXES) {
        const arr = index[p];
        if (arr) {
            const i = arr.indexOf(topic);
            if (i !== -1) {
                arr.splice(i, 1);
                changed = true;
            }
        }
    }
    if (changed) global.set("discoveryIndex", index, "file");
    return null;
}

// Parse the config payload to read unique_id.
let cfg = raw;
if (typeof raw === "string") {
    try {
        cfg = JSON.parse(raw);
    } catch (e) {
        return null;
    }
}
const uniqueId = cfg && cfg.unique_id;
if (typeof uniqueId !== "string") return null;

// Bucket by the integration prefix this entity belongs to.
const prefix = PREFIXES.find((p) => uniqueId.startsWith(p + "_"));
if (!prefix) return null;

const bucket = index[prefix] || (index[prefix] = []);
if (!bucket.includes(topic)) {
    bucket.push(topic);
    global.set("discoveryIndex", index, "file");
    node.status({ fill: "blue", shape: "dot", text: `${prefix}: ${bucket.length}` });
}

return null;
