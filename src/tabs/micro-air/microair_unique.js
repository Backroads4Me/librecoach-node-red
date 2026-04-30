// Filter duplicate MicroAir status messages and route by type
// Input: Standardized status object from microair_decode_status.js
//        OR config update from microair_decode_config.js
// Output 1: Climate (zone status — triggers create_microair_climate.js)
// Output 2: Sensor (outdoor temp — triggers create_microair_sensor.js)

const payload = msg.payload;
if (!payload || !payload.mac) return null;

// Retrieve existing MicroAir entities from global context
let uniqueMicroair = global.get("uniqueMicroair") || [];
let listChanged = false;

const mac = payload.mac;
const zone = payload.zone;
if (zone === undefined) return null;

// Define distinct keys for Climate and Sensor
const climateKey = `microair_${mac}_zone_${zone}_climate`;
const sensorKey = `microair_${mac}_zone_${zone}_sensor`;

const out = [null, null];

// Config update or capability change → force re-discovery of climate entity
const forceRediscovery = payload.config_updated || payload.max_fan_changed;

// 1. Check Climate Entity
if (!uniqueMicroair.includes(climateKey) || forceRediscovery) {
  if (!uniqueMicroair.includes(climateKey)) {
    uniqueMicroair.push(climateKey);
    listChanged = true;
  }
  out[0] = msg; // Send to Output 1 (Climate)
}

// 2. Check Sensor Entity (Outdoor Temp)
// Only valid for Zone 0 AND if outdoor_temperature is present
if (zone === 0 && payload.outdoor_temperature !== undefined) {
  if (!uniqueMicroair.includes(sensorKey) || forceRediscovery) {
    if (!uniqueMicroair.includes(sensorKey)) {
      uniqueMicroair.push(sensorKey);
      listChanged = true;
    }
    out[1] = msg; // Send to Output 2 (Sensor)
  }
}

// Update global context if new devices were found
if (listChanged) {
  global.set("uniqueMicroair", uniqueMicroair);
}

if (out[0] !== null || out[1] !== null) {
  return out;
}

return null;
