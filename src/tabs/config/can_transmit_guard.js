// Prevent any CAN transmission after LibreCoach loses its claimed address.

if (
  msg.topic === "can/send" &&
  (msg.suppress_can_send === true ||
    (global.get("rvc_address_claim_lost") === true &&
      msg.address_claim_management !== true))
) {
  return null;
}

return msg;
