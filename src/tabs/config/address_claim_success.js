// RV-C Address Claim Success Function
// Called after 250ms timer expires - finalizes address claim if no conflict lost
// Reference: RV-C Spec Section 3.3.2 - Source Address Claiming
//
// IMPORTANT: This does NOT send a second ADDRESS_CLAIMED message.
// We already sent ADDRESS_CLAIMED at the start of the process.
// Success = 250ms timer expires without losing a conflict.

// Get the address we were trying to claim when this timer started
const claimedAddress = msg.claiming_address;

if (claimedAddress === undefined || claimedAddress === null) {
  node.error("No address to claim - timer message missing claiming_address");
  return null;
}

// Check if this timer is still valid (claim hasn't been cancelled by monitor)
const claimInProgress = flow.get("claim_in_progress");
if (!claimInProgress) {
  // Claim was cancelled during the 250ms window (we lost a conflict)
  node.warn(
    `Timer expired for address ${claimedAddress}, but claim was cancelled - ignoring`,
  );
  return null;
}

// Verify we're still trying to claim the same address
const currentClaimingAddress = flow.get("claiming_address");
if (currentClaimingAddress !== claimedAddress) {
  node.warn(
    `Timer expired for address ${claimedAddress}, but we're now trying ${currentClaimingAddress} - ignoring stale timer`,
  );
  return null;
}

// SUCCESS! No conflict detected during the 250ms monitoring window
// Store the claimed address to global context
global.set("rvc_source_address", claimedAddress);
global.set("rvc_address_claim_lost", false);

// Clear claiming flags
flow.set("claim_in_progress", false);
// Keep the claimed address and NAME available for continuous conflict defence.
flow.set("claiming_address", claimedAddress);

//node.warn(`Successfully claimed address ${claimedAddress} (0x${claimedAddress.toString(16).toUpperCase()})`);
//node.warn(`Address stored to global.rvc_source_address: ${claimedAddress}`);

node.log(
  `Successfully claimed address ${claimedAddress} (0x${claimedAddress.toString(16).toUpperCase()})`,
);

// Return msg to trigger downstream polling
return msg;
