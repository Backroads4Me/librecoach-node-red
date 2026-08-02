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
  const shortName = (deviceInfo && deviceInfo.shortName) || serviceType;
  const productName = deviceInfo ? deviceInfo.productName : "";
  const customName = deviceInfo ? deviceInfo.customName : "";

  // Switchable outputs carry their own GX name, distinct from the device name.
  let outputCustomName = "";
  if (dbusPath.startsWith("/SwitchableOutput/")) {
    const victronOutputs = global.get("victronOutputs", "file") || {};
    const outputInfo =
      victronOutputs[`${serviceType}_${instance}_${dbusPath.split("/")[2]}`];
    outputCustomName = outputInfo ? outputInfo.customName || "" : "";
  }

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
        custom_name: customName,
        output_custom_name: outputCustomName,
        access: msg.payload.access,
        writable: msg.payload.writable,
        value_min: msg.payload.value_min,
        value_max: msg.payload.value_max,
      },
    },
  ];
}

// Return nothing if duplicate
return null;
