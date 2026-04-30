// Status Updater for Window Shade
// Decodes WINDOW_SHADE_CONTROL_STATUS messages (1FEDE)

// === Helper Functions ===

function decodeBits(value, startBit, endBit) {
  const mask = ((1 << (endBit - startBit + 1)) - 1) << startBit;
  return (value & mask) >> startBit;
}

// === WINDOW_SHADE_CONTROL_STATUS Specific Decoders ===

function decodeInstance(value) {
  // Window shade instance mapping
  if (value >= 1 && value <= 250) {
    return value; // Direct instance number
  } else if (value === 0) {
    return "All Instances";
  } else if (value === 255) {
    return "Not Available";
  }
  return "Invalid";
}

function decodeGroupDetails(value) {
  // Group membership bitmap decoding
  if (value === 0xff) {
    return { type: "special", description: "No data" };
  }
  if (value === 0x00) {
    return { type: "special", description: "Member of all groups" };
  }

  const groups = [];
  for (let bit = 0; bit < 7; bit++) {
    if (!(value & (1 << bit))) {
      groups.push(bit + 1);
    }
  }

  if (groups.length > 0) {
    return {
      type: "standard",
      groups: groups,
      description: `Groups: ${groups.join(", ")}`,
    };
  } else {
    return {
      type: "standard",
      groups: [],
      description: "No group membership",
    };
  }
}

function decodeOperatingStatus(value) {
  // Operating status (motor duty) as percentage per Table 5.3
  if (value <= 200) {
    return parseFloat((value * 0.5).toFixed(1)); // 0.5% per step, 0-100%
  } else if (value === 251) {
    return "Value Changing";
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

function decodeLockStatus(value) {
  // Lock status (bits 0-1)
  const lockMap = {
    0: "Load is unlocked",
    1: "Load is locked",
    3: "Lock command not supported",
  };
  return lockMap[value] || `Unknown Lock Status ${value}`;
}

function decodeMotorStatus(value) {
  // Motor status (bits 2-3)
  const motorMap = {
    0: "Neither 'Forward' nor 'Reverse' output is on",
    1: "Either 'Forward' or 'Reverse' output is on (Motor active)",
  };
  return motorMap[value] || `Unknown Motor Status ${value}`;
}

function decodeForwardStatus(value) {
  // Forward status (bits 4-5)
  const forwardMap = {
    0: "'Forward' output not on",
    1: "'Forward' output is on (Shade raising/opening)",
  };
  return forwardMap[value] || `Unknown Forward Status ${value}`;
}

function decodeReverseStatus(value) {
  // Reverse status (bits 6-7)
  const reverseMap = {
    0: "'Reverse' output not on",
    1: "'Reverse' output is on (Shade lowering/closing)",
  };
  return reverseMap[value] || `Unknown Reverse Status ${value}`;
}

function decodeDuration(value) {
  // Duration decoding
  if (value === 0) {
    return "Delay/duration expired";
  } else if (value >= 1 && value <= 239) {
    return `${value} seconds remaining`;
  } else if (value === 240) {
    return "240 or more seconds remaining";
  } else if (value === 255) {
    return "No delay/duration active";
  }
  return "Invalid";
}

function decodeLastCommand(value) {
  // Last command executed mapping per Table 6.39.3c
  const commandMap = {
    4: "Stop",
    129: "Forward (Open Shade)", // 0x81
    65: "Reverse (Close Shade)", // 0x41
    133: "Toggle Forward", // 0x85
    69: "Toggle Reverse", // 0x45
    16: "Tilt", // 0x10
    33: "Lock", // 0x21
    34: "Unlock", // 0x22
  };
  return commandMap[value] || `Unknown Command ${value}`;
}

function decodeOvercurrentStatus(value) {
  // Overcurrent status (bits 0-1)
  const overcurrentMap = {
    0: "Load output not in overcurrent",
    1: "Load output has drawn overcurrent",
    3: "Overcurrent status unavailable or not supported",
  };
  return overcurrentMap[value] || `Unknown Overcurrent Status ${value}`;
}

function decodeOverrideStatus(value) {
  // Override status (bits 2-3)
  const overrideMap = {
    0: "External override is inactive",
    1: "External override is active",
    3: "Override status is unavailable or not supported",
  };
  return overrideMap[value] || `Unknown Override Status ${value}`;
}

function decodeDisableStatus(value, disableNumber) {
  // Disable status for Disable1 (bits 4-5) or Disable2 (bits 6-7)
  const disableMap = {
    0: `Disable ${disableNumber} is not active`,
    1: `Disable ${disableNumber} is active`,
    3: `Disable ${disableNumber} is not supported`,
  };
  return disableMap[value] || `Unknown Disable${disableNumber} Status ${value}`;
}

// === Main Decode Function ===

function decodeWindowShadeControlStatusMessage(dgn, data) {
  const result = {
    dgn: dgn,
    dgn_name: "WINDOW_SHADE_CONTROL_STATUS",
  };

  if (data.length < 7) {
    return {
      error:
        "Invalid data length for WINDOW_SHADE_CONTROL_STATUS - expected at least 7 bytes",
    };
  }

  // Byte 0: Instance
  result.instance = data[0];
  result.instance_name = decodeInstance(data[0]);

  // Byte 1: Group
  const groupDetails = decodeGroupDetails(data[1]);
  result.group_description = groupDetails.description;
  if (groupDetails.groups) {
    result.groups = groupDetails.groups;
  }

  // Byte 2: Operating Status (Motor Duty)
  result.operating_status = decodeOperatingStatus(data[2]);

  // Byte 3: Lock Status, Motor Status, Forward Status, Reverse Status
  const byte3 = data[3];
  const lockStatusRaw = decodeBits(byte3, 0, 1);
  const motorStatusRaw = decodeBits(byte3, 2, 3);
  const forwardStatusRaw = decodeBits(byte3, 4, 5);
  const reverseStatusRaw = decodeBits(byte3, 6, 7);

  result.lock_status = decodeLockStatus(lockStatusRaw);
  result.motor_status = decodeMotorStatus(motorStatusRaw);
  result.forward_status = decodeForwardStatus(forwardStatusRaw);
  result.reverse_status = decodeReverseStatus(reverseStatusRaw);

  // Byte 4: Duration
  result.duration = decodeDuration(data[4]);

  // Byte 5: Last Command
  result.last_command = decodeLastCommand(data[5]);

  // Byte 6: Overcurrent Status, Override Status, Disable1 Status, Disable2 Status
  const byte6 = data[6];
  const overcurrentStatusRaw = decodeBits(byte6, 0, 1);
  const overrideStatusRaw = decodeBits(byte6, 2, 3);
  const disable1StatusRaw = decodeBits(byte6, 4, 5);
  const disable2StatusRaw = decodeBits(byte6, 6, 7);

  result.overcurrent_status = decodeOvercurrentStatus(overcurrentStatusRaw);
  result.override_status = decodeOverrideStatus(overrideStatusRaw);
  result.disable1_status = decodeDisableStatus(disable1StatusRaw, 1);
  result.disable2_status = decodeDisableStatus(disable2StatusRaw, 2);

  // Raw values for debugging
  result.raw_instance = data[0];
  result.raw_group = data[1];
  result.raw_operating_status = data[2];
  result.raw_byte3 = byte3;
  result.raw_lock_status = lockStatusRaw;
  result.raw_motor_status = motorStatusRaw;
  result.raw_forward_status = forwardStatusRaw;
  result.raw_reverse_status = reverseStatusRaw;
  result.raw_duration = data[4];
  result.raw_last_command = data[5];
  result.raw_byte6 = byte6;
  result.raw_overcurrent_status = overcurrentStatusRaw;
  result.raw_override_status = overrideStatusRaw;
  result.raw_disable1_status = disable1StatusRaw;
  result.raw_disable2_status = disable2StatusRaw;

  // Add convenience fields for Home Assistant integration
  result.is_locked = lockStatusRaw === 1;
  result.motor_active = motorStatusRaw === 1;
  result.shade_opening = forwardStatusRaw === 1;
  result.shade_closing = reverseStatusRaw === 1;
  result.shade_moving = result.shade_opening || result.shade_closing;
  result.has_overcurrent = overcurrentStatusRaw === 1;
  result.override_active = overrideStatusRaw === 1;
  result.disable1_active = disable1StatusRaw === 1;
  result.disable2_active = disable2StatusRaw === 1;
  result.any_disable_active = result.disable1_active || result.disable2_active;

  // Determine shade position status
  if (typeof result.operating_status === "number") {
    result.shade_position_percent = result.operating_status;
    result.shade_fully_open = result.operating_status >= 99;
    result.shade_fully_closed = result.operating_status <= 1;
    result.shade_partially_open =
      result.operating_status > 1 && result.operating_status < 99;
  } else {
    result.shade_position_percent = null;
    result.shade_fully_open = false;
    result.shade_fully_closed = false;
    result.shade_partially_open = false;
  }

  // Validate instance - Window shade valid instances are 1-250
  if (result.instance < 1 || result.instance > 250) {
    node.warn(
      `Invalid shade instance: ${result.instance} (${result.instance_name}) - message ignored`,
    );
    return null;
  }

  return result;
}

// === Main Logic ===

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

// Decode the WINDOW_SHADE_CONTROL_STATUS message
let decodedData;
if (dgn === "1FEDE") {
  decodedData = decodeWindowShadeControlStatusMessage(dgn, dataBytes);

  // Filter out messages that are either from an inactive instance OR are invalid/non-compliant.
  // Inactive: Operating Status is "Not Available" (raw value 255).
  // Invalid: Last Command is 0, which is not a defined command in the RV-C spec.
  if (
    decodedData.raw_operating_status === 255 ||
    decodedData.raw_last_command === 0
  ) {
    let reason =
      decodedData.raw_operating_status === 255
        ? "Inactive (Status Not Available)"
        : "Invalid (Last Command is 0)";
    node.debug(`Filtering out instance ${decodedData.instance}: ${reason}`);
    return null; // Stop the message from continuing.
  }
} else {
  decodedData = { error: `Decoder for DGN ${dgn} is not implemented.` };
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

// Clean up the final object by removing the raw data field
delete msg.payload.data_payload;

return msg;
