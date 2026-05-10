const timeSyncEnabled = global.get("timeSyncEnabled");
if (!timeSyncEnabled) return null;

const PRIORITY = 6;
const DGN = 0x1FFFE; // SET_DATE_TIME_COMMAND
const SOURCE_ADDRESS = global.get("rvc_source_address") || 254;

const dt = new Date();

const rvcDow = (jsDow) => (jsDow === 0 ? 1 : jsDow + 1);

const jan = new Date(dt.getFullYear(), 0, 1).getTimezoneOffset();
const jul = new Date(dt.getFullYear(), 6, 1).getTimezoneOffset();
const std = Math.max(jan, jul);
const isDst = dt.getTimezoneOffset() < std;
const tzCode = isDst ? std / 60 - 1 : std / 60;

const dataBytes = [
  Math.max(0, Math.min(255, dt.getFullYear() - 2000)),
  dt.getMonth() + 1,
  dt.getDate(),
  rvcDow(dt.getDay()),
  dt.getHours(),
  dt.getMinutes(),
  dt.getSeconds(),
  tzCode & 0xff,
];

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
