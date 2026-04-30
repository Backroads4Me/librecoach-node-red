// Parse Victron attributes CSV and store as nested Map in global context

const csvText = msg.payload;

if (!csvText || typeof csvText !== "string") {
  node.warn("store_victron_map: No CSV data received");
  return null;
}

const lines = csvText.split("\n").filter((line) => line.trim().length > 0);

// Build nested Map: serviceType → Map(path → { type, unit, scale, access })
const victronMap = new Map();

for (const line of lines) {
  const parts = line.split(",");
  if (parts.length < 8) continue;

  const [service, path, type, unit, register, dataType, scale, access] =
    parts.map((p) => p.trim());

  // Strip "com.victronenergy." prefix to get short service type
  const serviceType = service.replace("com.victronenergy.", "");

  if (!victronMap.has(serviceType)) {
    victronMap.set(serviceType, new Map());
  }

  victronMap.get(serviceType).set(path, {
    type,
    unit,
    scale,
    access,
  });
}

// Store in global context
global.set("victronMap", victronMap);

// Count total records across all service types
let totalRecords = 0;
for (const [, pathMap] of victronMap) {
  totalRecords += pathMap.size;
}

node.status({
  fill: "green",
  shape: "dot",
  text: "Reference loaded",
});

return null;
