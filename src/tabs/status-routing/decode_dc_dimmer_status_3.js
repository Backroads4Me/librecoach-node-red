// DC Dimmer Decoder
// Decodes DC_DIMMER_STATUS_1/2/3 messages (1FFBB, 1FFBA, 1FEDA)

// --- Helper Functions ---

function decodeBits(value, startBit, endBit) {
  const mask = ((1 << (endBit - startBit + 1)) - 1) << startBit;
  return (value & mask) >> startBit;
}

// --- DC_DIMMER_STATUS Specific Decoders ---

function decodeDimmerInstance(value) {
  // Dimmer instance interpretation
  if (value === 0) {
    return "Invalid";
  } else if (value <= 250) {
    return value; // Direct instance number
  } else if (value === 251) {
    return "Error";
  } else if (value === 252) {
    return "Not Supported";
  } else if (value === 253) {
    return "Out of Range";
  } else if (value === 254) {
    return "Reserved";
  } else if (value === 255) {
    return "Not Available";
  }
  return "Invalid";
}

function decodeBrightnessLevel(value) {
  // Brightness level (0-200% per Table 5.3)
  if (value <= 200) {
    return parseFloat((value * 0.5).toFixed(1)); // 0.5% per step, 0-100%
  } else if (value === 251) {
    return "Value Changing (Ramp)";
  } else if (value === 252) {
    return "Output Flashing";
  } else if (value === 253) {
    return "Out of Range";
  } else if (value === 254) {
    return "Reserved";
  } else if (value === 255) {
    return "Not Available";
  }
  return "Invalid";
}

function decodeDCCurrent(value) {
  // DC Current per Table 5.3 (0.05A resolution for small currents)
  if (value <= 250) {
    return parseFloat((value * 0.05).toFixed(2)); // 0.05A per step
  } else if (value === 251) {
    return "Error";
  } else if (value === 252) {
    return "Not Supported";
  } else if (value === 253) {
    return "Out of Range";
  } else if (value === 254) {
    return "Reserved";
  } else if (value === 255) {
    return "Not Available";
  }
  return "Invalid";
}

function decodeChannelFault(value) {
  // Channel fault status (2-bit field)
  const faultStates = {
    0: "No Fault",
    1: "Undercurrent (Open Circuit)",
    2: "Overcurrent",
    3: "Reserved",
  };
  return faultStates[value] || "Unknown";
}

function decodeFaultByte(value) {
  // Decode fault bits from byte 5 (STATUS_2)
  const masterFault = decodeBits(value, 0, 1);
  const redFault = decodeBits(value, 2, 3);
  const greenFault = decodeBits(value, 4, 5);
  const blueFault = decodeBits(value, 6, 7);

  const faults = [];
  if (masterFault > 0)
    faults.push(`Master: ${decodeChannelFault(masterFault)}`);
  if (redFault > 0) faults.push(`Red: ${decodeChannelFault(redFault)}`);
  if (greenFault > 0) faults.push(`Green: ${decodeChannelFault(greenFault)}`);
  if (blueFault > 0) faults.push(`Blue: ${decodeChannelFault(blueFault)}`);

  return {
    fault_summary: faults.length > 0 ? faults.join(", ") : "No Faults",
    master_fault: decodeChannelFault(masterFault),
    red_fault: decodeChannelFault(redFault),
    green_fault: decodeChannelFault(greenFault),
    blue_fault: decodeChannelFault(blueFault),
    any_fault: faults.length > 0,
  };
}

function decodeGroupBitmap(value) {
  // Group membership bitmap (7 groups max)
  if (value === 0) {
    return "All Groups";
  } else if (value === 255) {
    return "No Data";
  }

  const groups = [];
  for (let i = 1; i <= 7; i++) {
    const groupBit = 1 << i;
    if (!(value & groupBit)) {
      // Inverted logic - 0 means member
      groups.push(i);
    }
  }

  return groups.length > 0 ? `Groups: ${groups.join(", ")}` : "No Groups";
}

function decodeOperatingStatus(value) {
  // Operating status for STATUS_3
  if (value <= 200) {
    return parseFloat((value * 0.5).toFixed(1)); // 0.5% per step
  } else if (value === 251) {
    return "Value Changing (Ramp)";
  } else if (value === 252) {
    return "Output Flashing";
  } else if (value === 253) {
    return "Out of Range";
  } else if (value === 254) {
    return "Reserved";
  } else if (value === 255) {
    return "Not Available";
  }
  return "Invalid";
}

function decodeStatus3Byte3(value) {
  // Decode status bits from byte 3 (STATUS_3)
  const lockStatus = decodeBits(value, 0, 1);
  const overcurrentStatus = decodeBits(value, 2, 3);
  const overrideStatus = decodeBits(value, 4, 5);
  const enableStatus = decodeBits(value, 6, 7);

  const lockStates = ["Unlocked", "Locked", "Reserved", "Not Supported"];
  const statusStates = [
    "Normal/Inactive",
    "Active/Abnormal",
    "Reserved",
    "Not Supported",
  ];
  const enableStates = ["Enabled", "Disabled", "Reserved", "Not Supported"];

  return {
    lock_status: lockStates[lockStatus] || "Unknown",
    overcurrent_status: statusStates[overcurrentStatus] || "Unknown",
    override_status: statusStates[overrideStatus] || "Unknown",
    enable_status: enableStates[enableStatus] || "Unknown",
  };
}

function decodeLastCommand(value) {
  // Last executed command (STATUS_3)
  const commands = {
    0: "Set Brightness",
    1: "ON",
    2: "ON Delay",
    3: "OFF",
    4: "Stop",
    5: "Toggle",
    6: "Memory OFF",
    7: "Save Scene",
    11: "Ramp Brightness",
    12: "Ramp Toggle",
    13: "Ramp Up",
    14: "Ramp Down",
    15: "Ramp Up/Down",
    16: "Ramp Up/Down Toggle",
    21: "Lock",
    22: "Unlock",
    31: "Flash",
    32: "Flash Momentary",
    33: "Flash Pattern",
    34: "Scene Recall",
    35: "Scene Store",
    36: "Group Command",
    37: "Reset",
    38: "Factory Reset",
    39: "Calibrate",
    40: "Test Mode",
    251: "Error",
    252: "Not Supported",
    253: "Out of Range",
    254: "Reserved",
    255: "Not Available",
  };

  return commands[value] || `Unknown Command ${value}`;
}

function decodeDelayDuration(value) {
  // Delay/Duration field (STATUS_3)
  if (value === 0) {
    return "Expired";
  } else if (value <= 240) {
    return `${value} seconds`;
  } else if (value >= 241 && value <= 250) {
    return `${value - 236} minutes`; // 241-250 = 5-14 minutes
  } else if (value === 252) {
    return "Flashing";
  } else if (value === 253) {
    return ">240 seconds";
  } else if (value === 255) {
    return "No delay active";
  }
  return "Invalid";
}

function decodeStatus3Byte6(value) {
  // Decode status bits from byte 6 (STATUS_3)
  const interlockStatus = decodeBits(value, 0, 1);
  const loadStatus = decodeBits(value, 2, 3);
  const undercurrentStatus = decodeBits(value, 6, 7);

  const interlockStates = ["Not Active", "Active", "Reserved", "Not Supported"];
  const loadStates = [
    "Off (status=0)",
    "On (status>0 or flashing)",
    "Reserved",
    "Reserved",
  ];
  const undercurrentStates = [
    "Normal",
    "Active",
    "Timeout Error",
    "Not Supported",
  ];

  return {
    interlock_status: interlockStates[interlockStatus] || "Unknown",
    load_status: loadStates[loadStatus] || "Unknown",
    undercurrent_status: undercurrentStates[undercurrentStatus] || "Unknown",
  };
}

// --- Main Decode Function ---

function decodeDCDimmerMessage(dgn, data) {
  // Map DGN hex codes to specific names for unified routing
  let dgn_name = "DC_DIMMER_STATUS"; // fallback
  const dgnHex = dgn.toUpperCase();
  if (dgnHex === "1FFBB") {
    dgn_name = "DC_DIMMER_STATUS_1";
  } else if (dgnHex === "1FFBA") {
    dgn_name = "DC_DIMMER_STATUS_2";
  } else if (dgnHex === "1FEDA") {
    dgn_name = "DC_DIMMER_STATUS_3";
  }

  const result = {
    dgn: dgn,
    dgn_name: dgn_name,
  };

  // Determine which STATUS message based on DGN and decode accordingly

  if (dgnHex === "1FFBB") {
    // DC_DIMMER_STATUS_1 - Brightness levels and timing
    result.status_type = "STATUS_1";

    if (data.length >= 7) {
      result.instance = data[0];
      result.instance_name = decodeDimmerInstance(data[0]);
      result.master_brightness = decodeBrightnessLevel(data[1]);
      result.red_brightness = decodeBrightnessLevel(data[2]);
      result.green_brightness = decodeBrightnessLevel(data[3]);
      result.blue_brightness = decodeBrightnessLevel(data[4]);

      // Byte 5: On/Off Duration (4 bits each)
      result.on_duration = decodeBits(data[5], 0, 3); // 0-14 seconds
      result.off_duration = decodeBits(data[5], 4, 7); // 0-14 seconds

      if (data.length > 6) {
        result.white_brightness = decodeBrightnessLevel(data[6]);
      }
    }
  } else if (dgnHex === "1FFBA") {
    // DC_DIMMER_STATUS_2 - Current measurements and faults
    result.status_type = "STATUS_2";

    if (data.length >= 8) {
      result.instance = data[0];
      result.instance_name = decodeDimmerInstance(data[0]);
      result.red_current = decodeDCCurrent(data[2]);
      result.green_current = decodeDCCurrent(data[3]);
      result.blue_current = decodeDCCurrent(data[4]);

      // Byte 5: Fault bits
      const faultInfo = decodeFaultByte(data[5]);
      Object.assign(result, faultInfo);

      if (data.length > 6) {
        result.white_current = decodeDCCurrent(data[6]);
      }

      if (data.length > 7) {
        // Byte 7: White fault (bits 0-1)
        const whiteFault = decodeBits(data[7], 0, 1);
        result.white_fault = decodeChannelFault(whiteFault);
      }
    }
  } else if (dgnHex === "1FEDA") {
    // DC_DIMMER_STATUS_3 - Comprehensive operational status
    result.status_type = "STATUS_3";

    if (data.length >= 8) {
      result.instance = data[0];
      result.instance_name = decodeDimmerInstance(data[0]);
      result.group_membership = decodeGroupBitmap(data[1]);
      result.operating_status = decodeOperatingStatus(data[2]);

      // Byte 3: Status bits
      const status3Info = decodeStatus3Byte3(data[3]);
      Object.assign(result, status3Info);

      result.delay_duration = decodeDelayDuration(data[4]);
      result.last_command = decodeLastCommand(data[5]);

      // Byte 6: More status bits
      const status6Info = decodeStatus3Byte6(data[6]);
      Object.assign(result, status6Info);

      result.master_memory_value = decodeBrightnessLevel(data[7]);
    }
  }

  // Validate instance - DC Dimmer valid instances are 1-250
  if (result.instance < 1 || result.instance > 250) {
    node.warn(
      `Invalid DC dimmer instance: ${result.instance} (${result.instance_name}) - message ignored`,
    );
    return null;
  }

  // Add convenience fields
  if (result.master_brightness !== undefined) {
    result.dimmer_on =
      typeof result.master_brightness === "number" &&
      result.master_brightness > 0;
  }

  if (result.operating_status !== undefined) {
    result.dimmer_active =
      typeof result.operating_status === "number" &&
      result.operating_status > 0;
  }

  if (result.any_fault !== undefined) {
    result.dimmer_healthy = !result.any_fault;
  }

  return result;
}

// --- Main Logic ---

// Validate input payload
if (!msg.payload || typeof msg.payload !== "object") {
  node.warn("Invalid payload: expected object");
  return null;
}

const incomingPayload = msg.payload;
const { dgn, data_payload } = incomingPayload;

if (!dgn || !data_payload) {
  node.warn("Missing required fields: dgn and/or data_payload");
  return null;
}

// Validate and convert hex payload to byte array
if (typeof data_payload !== "string" || data_payload.length % 2 !== 0) {
  node.warn("Invalid data_payload: must be even-length hex string");
  return null;
}

const dataBytes = [];
for (let i = 0; i < data_payload.length; i += 2) {
  const hexByte = data_payload.substring(i, i + 2);
  const byteValue = parseInt(hexByte, 16);
  if (isNaN(byteValue)) {
    node.warn(`Invalid hex byte in data_payload: ${hexByte}`);
    return null;
  }
  dataBytes.push(byteValue);
}

// Decode the DC_DIMMER_STATUS message
const decodedData = decodeDCDimmerMessage(dgn, dataBytes);

// Handle null return (invalid instance filtered out)
if (!decodedData) {
  return null;
}

// Handle decode errors
if (decodedData.error) {
  incomingPayload.decoding_error = decodedData.error;
  msg.payload = incomingPayload;
  return msg;
}

// Merge the incoming payload and the decoded data into a single flat object
msg.payload = {
  ...incomingPayload,
  ...decodedData,
};

return msg;
