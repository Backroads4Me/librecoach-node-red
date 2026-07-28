// Answer requests for ADDRESS_CLAIMED after LibreCoach has claimed an address.

const claimedAddress = global.get("rvc_source_address");
const deviceName = flow.get("our_device_name");
const request = msg.payload || {};
const data = String(request.data_payload || "").toUpperCase();

if (
  global.get("rvc_address_claim_lost") === true ||
  !Number.isInteger(claimedAddress) ||
  typeof deviceName !== "string" ||
  !/^[0-9A-F]{16}$/.test(deviceName)
) {
  return null;
}

// Requested DGN is little-endian in bytes 0-2: EE00h = 00 EE 00.
if (data.length < 6 || data.substring(0, 6) !== "00EE00") {
  return null;
}

// RV-C 3.2.4.3 forbids requesting ADDRESS_CLAIM globally, so a conforming node
// addresses the request to us. Answering FFh anyway is deliberate: it costs one
// frame and keeps LibreCoach visible to diagnostic tools that get this wrong.
const destination = request.destination_address;
if (destination !== claimedAddress && destination !== 0xff) {
  return null;
}

const canId = ((6 << 26) | (0xee00 << 8) | claimedAddress) >>> 0;
msg.topic = "can/send";
msg.payload = `${canId.toString(16).padStart(8, "0").toUpperCase()}#${deviceName.toUpperCase()}`;
msg.address_claim_management = true;
return msg;
