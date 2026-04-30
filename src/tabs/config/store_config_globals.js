const key = msg.topic.split("/").pop();
const val = msg.payload.toString() === "true";

if (key === "victron_enabled") global.set("victronEnabled", val);
if (key === "beta_enabled") global.set("betaEnabled", val);
if (key === "microair_enabled") global.set("microairEnabled", val);
if (key === "geo_enabled") global.set("geoEnabled", val);

return msg;
