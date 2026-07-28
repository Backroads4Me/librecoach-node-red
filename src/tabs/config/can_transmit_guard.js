// Prevent any CAN transmission after LibreCoach loses its claimed address.
//
// Every CAN frame leaves through the unretained MQTT path with topic
// "can/send"; retained publishes are Home Assistant state and never reach the
// bus. Address-management frames are exempt, because claiming a new address is
// the only way out of the lost state.

if (
  msg.topic === "can/send" &&
  global.get("rvc_address_claim_lost") === true &&
  msg.address_claim_management !== true
) {
  return null;
}

return msg;