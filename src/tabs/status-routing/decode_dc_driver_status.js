// Decode DC Component Driver Status Messages (16F00 - 16300)

const payload = msg.payload;

if (
  !payload ||
  !payload.dgn_name ||
  !payload.dgn_name.startsWith("DC_COMPONENT_DRIVER_STATUS_")
) {
  return null;
}

const data_payload = payload.data_payload;
if (
  !data_payload ||
  typeof data_payload !== "string" ||
  data_payload.length < 16
) {
  return null;
}

const bytePairs = data_payload.match(/.{1,2}/g);
if (!bytePairs || bytePairs.length < 8) {
  return null;
}

const device_instance = parseInt(bytePairs[0], 16);
const driver_index = parseInt(bytePairs[1], 16);

let out = {
  originalMessage: payload.originalMessage,
  dgn: payload.dgn,
  dgn_name: payload.dgn_name,
  device_instance: device_instance,
  driver_index: driver_index,
  instance: driver_index, // Override instance with functional driver_index
};

if (payload.destination_address !== undefined) {
  out.destination_address = payload.destination_address;
}

switch (payload.dgn_name) {
  case "DC_COMPONENT_DRIVER_STATUS_1": {
    out.voltage = parseInt(bytePairs[3] + bytePairs[2], 16) * 0.05;
    out.current = parseInt(bytePairs[5] + bytePairs[4], 16) * 0.05 - 1600.0;

    const b6 = parseInt(bytePairs[6], 16);
    out.overcurrent_status = b6 & 0x03;
    out.output_on = (b6 >> 2) & 0x03; // 00=off, 01=on
    out.momentary_status = (b6 >> 4) & 0x03;

    const b7 = parseInt(bytePairs[7], 16);
    out.shutdown_reason = b7 & 0x0f;
    break;
  }
  case "DC_COMPONENT_DRIVER_STATUS_6": {
    // 0-200 raw = 0-100% (0.5% per step); 201-255 are RV-C special values
    // (error/reserved/not available) — leave pwm_duty_cycle unset for those.
    const pwmRaw = parseInt(bytePairs[3], 16);
    if (pwmRaw <= 200) {
      out.pwm_duty_cycle = pwmRaw * 0.5;
    }
    const b4 = parseInt(bytePairs[4], 16);
    out.direction = b4 & 0x03;
    out.lock_status = (b4 >> 2) & 0x03;
    out.command_timeout = (b4 >> 4) & 0x03;
    break;
  }
}

msg.payload = out;
return msg;
