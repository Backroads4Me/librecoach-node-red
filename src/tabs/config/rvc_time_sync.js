// Broadcasts DATE_TIME_STATUS to the RV-C network (DGN 1FFFFh, §6.4)
// Fires every 60s via inject node. Gated by timeSyncEnabled global (default: false).
// Note: spec nominal interval is 1000 ms; 60s is adequate for clock correction without
// competing with a hardware master. No source-address arbitration is implemented here.

// --- Configuration ---
const PRIORITY = 6;
const DGN = 0x1ffff;
const SOURCE_ADDRESS = global.get("rvc_source_address") || 254;

// --- Feature Gate ---
const timeSyncEnabled = global.get("timeSyncEnabled");
if (!timeSyncEnabled) return null;

// --- Current Time ---
const dt = new Date();

// --- Helpers ---
// RV-C DOW: 1=Sunday..7=Saturday (JS getDay(): 0=Sun..6=Sat)
const rvcDow = (jsDow) => (jsDow === 0 ? 1 : jsDow + 1);

// Derive TZ code from system UTC offset: std offset in hours, minus 1 if DST active
const jan = new Date(dt.getFullYear(), 0, 1).getTimezoneOffset();
const jul = new Date(dt.getFullYear(), 6, 1).getTimezoneOffset();
const std = Math.max(jan, jul);
const isDst = dt.getTimezoneOffset() < std;
const tzCode = isDst ? std / 60 - 1 : std / 60;

// --- Payload ---
// Byte layout per RV-C §6.4 Table 6.4.2b: year(offset 2000), month, day, dow, hour, min, sec, tz
const dataBytes = [
  Math.max(0, Math.min(255, dt.getFullYear() - 2000)), // Byte 0: Year (2000..2255)
  dt.getMonth() + 1, // Byte 1: Month (1..12)
  dt.getDate(), // Byte 2: Day (1..31)
  rvcDow(dt.getDay()), // Byte 3: Day of week (1..7)
  dt.getHours(), // Byte 4: Hour (0..23)
  dt.getMinutes(), // Byte 5: Minute (0..59)
  dt.getSeconds(), // Byte 6: Second (0..59)
  tzCode & 0xff, // Byte 7: Timezone code
];

// --- Build and Send ---
const dataHex = dataBytes
  .map((b) => b.toString(16).padStart(2, "0"))
  .join("")
  .toUpperCase();
const canIdInt = (PRIORITY << 26) | (DGN << 8) | SOURCE_ADDRESS;
const canIdHex = canIdInt.toString(16).padStart(8, "0").toUpperCase();

node.status({
  fill: "green",
  shape: "dot",
  text: `${dt.getMonth() + 1}/${dt.getDate()} ${dt.getHours().toString().padStart(2, "0")}:${dt.getMinutes().toString().padStart(2, "0")}:${dt.getSeconds().toString().padStart(2, "0")} tz=${tzCode}`,
});

return { topic: "can/send", payload: `${canIdHex}#${dataHex}` };
