// RV-C Address Claim Monitor Function
// Assumes it ONLY receives decoded ADDRESS_CLAIMED messages (DGN EE00)
// Compares device NAMEs to determine winner in case of conflict

const claimInProgress = flow.get("claim_in_progress");
if (!claimInProgress) {
  return null; // Not in the claiming process
}

const claimingAddress = flow.get("claiming_address");
const ourDeviceName = flow.get("our_device_name");
const competitorName = msg.payload.data_payload.toUpperCase();
const sourceAddressInt = parseInt(msg.payload.sourceAddress, 16);

// Check if a message is for the same address we are trying to claim
if (sourceAddressInt === claimingAddress) {
  // First, verify this isn't our own message being echoed back.
  // If the NAMEs are identical, it's our own claim. Ignore it and let the timer run.
  if (competitorName === ourDeviceName) {
    // This is our own message, not a real conflict.
    return null;
  }

  // If we get here, it's a real conflict from a different device.
  node.warn(`Address ${claimingAddress} conflict detected!`);
  node.warn(`Our NAME: ${ourDeviceName}, Competitor NAME: ${competitorName}`);

  // Compare NAMEs - Lower numerical value wins
  const ourNameValue = BigInt("0x" + ourDeviceName);
  const competitorNameValue = BigInt("0x" + competitorName);

  if (ourNameValue < competitorNameValue) {
    // WE WIN
    node.warn(
      `We WIN the conflict. Continuing to claim address ${claimingAddress}`,
    );
    return null;
  } else {
    // WE LOSE
    node.warn(
      `We LOSE the conflict. Cancelling timer and trying next address.`,
    );
    flow.set("claim_in_progress", false);

    const retryMsg = { topic: "address_claim_retry" };
    const resetTimerMsg = { reset: true };

    return [retryMsg, resetTimerMsg];
  }
}

// If we reach here, it's a claim for a different address, so ignore it.
return null;