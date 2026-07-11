// Decode Victron MQTT topic and payload into standardized message

// Optimized Decode: Rounds, Filters, and calculates Totals early
const victronEnabled = global.get("victronEnabled");
if (!victronEnabled) return null;

// Track liveness for the availability watchdog in victron_keep_alive. Venus OS
// has no native online/offline topic, so the freshness of inbound N/+/# data is
// our connectivity signal.
global.set("victronLastSeen", Date.now());

const topic = msg.topic;
if (!topic || typeof topic !== "string") return null;

const parts = topic.split("/");
if (parts.length < 5) return null;

const serviceType = parts[2];
const instance = parts[3];
const dbusPath = "/" + parts.slice(4).join("/");

// === 1. Path Whitelist Gate ===
const pathWhitelist = {
  system: [
    "/Dc/Battery/Soc",
    "/Dc/Battery/Voltage",
    "/Dc/Battery/Current",
    "/Dc/Battery/Power",
    "/Dc/Battery/Temperature",
    "/Dc/Pv/Power",
    "/Dc/Pv/Current",
    "/Ac/Consumption/L1/Power",
    "/Ac/Consumption/L2/Power",
    "/Ac/Grid/L1/Power",
    "/Ac/Grid/L2/Power",
    "/Ac/ActiveIn/ActiveInput",
    "/Ac/ActiveIn/Source",
    "/Dc/System/Power",
    "/Dc/Battery/TimeToGo",
    "/SystemState/State",
    "/Relay/0/State",
    "/Relay/1/State",
  ],
  // Overlaps with system:/Dc/Battery/*, which mirrors only the elected battery
  // monitor — per-device paths are kept so additional shunts/BMS batteries report.
  battery: [
    "/Dc/0/Voltage",
    "/Dc/0/Current",
    "/Dc/0/Power",
    "/Dc/0/Temperature",
    "/Dc/1/Voltage",
    "/Soc",
    "/ConsumedAmphours",
    "/Alarms/LowVoltage",
  ],
  solarcharger: [
    "/Yield/Power",
    "/Yield/System",
    "/History/Daily/0/Yield",
    "/Dc/0/Voltage",
    "/Dc/0/Current",
    "/Pv/V",
    "/State",
  ],
  charger: ["/Dc/0/Voltage", "/Dc/0/Current", "/Ac/In/L1/P", "/State"],
  alternator: [
    "/Dc/0/Voltage",
    "/Dc/0/Current",
    "/Dc/0/Power",
    "/Dc/In/V",
    "/Dc/In/I",
    "/Dc/In/P",
    "/State",
  ],
  dcdc: [
    "/Dc/0/Voltage",
    "/Dc/0/Current",
    "/Dc/0/Power",
    "/Dc/In/V",
    "/Dc/In/I",
    "/Dc/In/P",
    "/State",
  ],
  grid: ["/Ac/L1/Power", "/Ac/L2/Power", "/Ac/Power"],
  acload: ["/Ac/L1/Power", "/Ac/L2/Power", "/Ac/Power"],
  tank: ["/Level", "/Remaining", "/FluidType"],
  temperature: ["/Temperature", "/Humidity"],
  digitalinput: ["/InputState", "/Count"],
  vebus: [
    "/Ac/ActiveIn/L1/V",
    "/Ac/ActiveIn/L1/I",
    "/Ac/ActiveIn/L1/P",
    "/Ac/ActiveIn/L2/V",
    "/Ac/ActiveIn/L2/I",
    "/Ac/ActiveIn/L2/P",
    "/Ac/Out/L1/V",
    "/Ac/Out/L1/I",
    "/Ac/Out/L1/P",
    "/Ac/Out/L2/V",
    "/Ac/Out/L2/I",
    "/Ac/Out/L2/P",
    "/Ac/ActiveIn/CurrentLimit",
    "/Ac/ActiveIn/L1/F",
    "/Dc/0/Voltage",
    "/Dc/0/Current",
    "/Dc/0/Power",
    "/Dc/0/Temperature",
    "/State",
    "/Mode",
    "/Relay/0/State",
    "/Ac/ActiveIn/Connected",
    "/Alarms/LowBattery",
    "/Alarms/Overload",
    "/Alarms/HighTemperature",
  ],
};

const allowedPaths = pathWhitelist[serviceType];
if (!allowedPaths || !allowedPaths.includes(dbusPath)) return null;

// === 2. Device Discovery Gate ===
const victronDevices = global.get("victronDevices", "file") || {};
if (!victronDevices[`${serviceType}_${instance}`]) return null;

// === 3. Value Extraction & Early Rounding ===
let rawValue;
try {
  const parsed =
    typeof msg.payload === "string" ? JSON.parse(msg.payload) : msg.payload;
  rawValue = parsed && parsed.value !== undefined ? parsed.value : parsed;
} catch (e) {
  rawValue = msg.payload;
}

// Venus encodes "not discharging" TimeToGo as null, 0, or the 864000 s
// (10-day) infinity cap, and can flap between them while charging. Normalize
// all three to a non-numeric marker so they survive the pipeline's null gates;
// the HA discovery template renders any non-numeric value as unknown.
if (
  dbusPath.endsWith("/TimeToGo") &&
  (rawValue === null || rawValue === 0 || rawValue >= 864000)
) {
  rawValue = "unknown";
}

if (rawValue === null || rawValue === undefined) return null;

let processedValue = rawValue;
if (typeof rawValue === "number") {
  const decimals = dbusPath.toLowerCase().includes("soc") ? 0 : 1;
  processedValue =
    Math.round(rawValue * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

// === 4. Early RBE Filter ===
const cacheKey = `rbe_${serviceType}_${instance}_${dbusPath}`;
const discoveryKey = `${serviceType}_${instance}_${dbusPath}`;
const uniqueVictron = global.get("uniqueVictron") || [];
const discoverySeen = uniqueVictron.includes(discoveryKey);
const alwaysPublishState =
  dbusPath === "/Mode" || dbusPath === "/Ac/ActiveIn/CurrentLimit";
if (
  flow.get(cacheKey) === processedValue &&
  discoverySeen &&
  !alwaysPublishState
)
  return null;
flow.set(cacheKey, processedValue);

// === 5. Map Lookup ===
const victronMap = global.get("victronMap");

// Block processing until map is loaded — prevents unitless discovery at startup.
if (!victronMap) return null;

let unit = "",
  dataType = "",
  scale = "",
  access = "";

if (victronMap.has(serviceType)) {
  const def = victronMap.get(serviceType).get(dbusPath);
  if (def) {
    unit = def.unit || "";
    dataType = def.type || "";
    scale = def.scale || "";
    access = def.access || "";
  }
}

// === 6. Build Standardized Payload (Removed routing_key) ===
const basePayload = {
  service_type: serviceType,
  instance: instance,
  dbus_path: dbusPath,
  value: processedValue,
  unit: unit,
  data_type: dataType,
  scale: scale,
  access: access,
  writable: access === "W" || access === "RW",
};

msg.payload = basePayload;

// === 7. Synthetic Totals (using node.send) ===
const powerTotalPairs = [
  {
    l1: "/Ac/Consumption/L1/Power",
    l2: "/Ac/Consumption/L2/Power",
    total: "/Ac/Consumption/Total/Power",
  },
  {
    l1: "/Ac/Grid/L1/Power",
    l2: "/Ac/Grid/L2/Power",
    total: "/Ac/Grid/Total/Power",
  },
  {
    l1: "/Ac/ActiveIn/L1/P",
    l2: "/Ac/ActiveIn/L2/P",
    total: "/Ac/ActiveIn/Total/P",
  },
  { l1: "/Ac/Out/L1/P", l2: "/Ac/Out/L2/P", total: "/Ac/Out/Total/P" },
];

for (const pair of powerTotalPairs) {
  if (dbusPath === pair.l1 || dbusPath === pair.l2) {
    const contextKey = `total_${serviceType}_${instance}_${pair.total}`;
    const stored = flow.get(contextKey) || {};

    if (dbusPath === pair.l1) stored.l1 = processedValue;
    if (dbusPath === pair.l2) stored.l2 = processedValue;
    flow.set(contextKey, stored);

    if (stored.l1 !== undefined && stored.l2 !== undefined) {
      node.send({
        payload: {
          ...basePayload,
          dbus_path: pair.total,
          value: (Number(stored.l1) || 0) + (Number(stored.l2) || 0),
        },
      });
    }
    break;
  }
}

// === 8. Synthetic VE.Bus Flow Sensors ===
// Power-flow cards need directional (positive-only) values, but the VE.Bus
// DC side is one signed sensor. Derive charge/invert splits and the total
// power the device delivers on both sides (AC out + DC charge).
function sendSynthetic(path, value) {
  const rounded = Math.round(value * 10) / 10;
  const rbeKey = `rbe_${serviceType}_${instance}_${path}`;
  const seen = uniqueVictron.includes(`${serviceType}_${instance}_${path}`);
  if (flow.get(rbeKey) === rounded && seen) return;
  flow.set(rbeKey, rounded);
  node.send({
    payload: { ...basePayload, dbus_path: path, value: rounded, unit: "W" },
  });
}

if (serviceType === "vebus") {
  const flowKey = `vebusflow_${instance}`;
  const st = flow.get(flowKey) || {};
  let touched = false;

  if (dbusPath === "/Dc/0/Power") {
    st.dc = processedValue;
    touched = true;
  }
  if (dbusPath === "/Ac/Out/L1/P" || dbusPath === "/Ac/Out/L2/P") {
    const t = flow.get(`total_vebus_${instance}_/Ac/Out/Total/P`) || {};
    if (t.l1 !== undefined && t.l2 !== undefined) {
      st.acOut = (Number(t.l1) || 0) + (Number(t.l2) || 0);
      touched = true;
    }
  }

  if (touched) {
    flow.set(flowKey, st);
    if (st.dc !== undefined) {
      sendSynthetic("/Dc/0/ChargePower", Math.max(0, st.dc));
      sendSynthetic("/Dc/0/InverterPower", Math.max(0, -st.dc));
      if (st.acOut !== undefined) {
        sendSynthetic("/TotalOutputPower", st.acOut + Math.max(0, st.dc));
      }
    }
  }
}

return msg;
