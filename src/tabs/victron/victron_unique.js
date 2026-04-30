// Unique Filter for Victron entities

// Retrieve existing Victron entities from flow context, or initialize as empty array
let uniqueVictron = global.get("uniqueVictron") || [];

const serviceType = msg.payload.service_type;
const instance = msg.payload.instance;
const dbusPath = msg.payload.dbus_path;

// Build unique key
const key = `${serviceType}_${instance}_${dbusPath}`;

// Check if this entity has been seen before
if (!uniqueVictron.includes(key)) {
  uniqueVictron.push(key);
  global.set("uniqueVictron", uniqueVictron);

  // Look up product short name from discovered devices
  const victronDevices = global.get("victronDevices", "file") || {};
  const deviceInfo = victronDevices[`${serviceType}_${instance}`];
  const shortName = deviceInfo ? deviceInfo.shortName : serviceType;
  const productName = deviceInfo ? deviceInfo.productName : "";

  return [
    { reset: true },
    {
      payload: {
        service_type: serviceType,
        instance: instance,
        dbus_path: dbusPath,
        unit: msg.payload.unit,
        value: msg.payload.value,
        short_name: shortName,
        product_name: productName,
        access: msg.payload.access,
        writable: msg.payload.writable,
      },
    },
  ];
}

// Return nothing if duplicate
return null;
