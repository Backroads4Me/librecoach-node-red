// RV-C Address Claim Monitor Function
// Assumes it ONLY receives decoded ADDRESS_CLAIMED messages (DGN EE00)
// Compares device NAMEs to determine winner in case of conflict

const claimInProgress = flow.get("claim_in_progress") === true;
const claimingAddress = flow.get("claiming_address");
const ourDeviceName = flow.get("our_device_name");
if (
  !Number.isInteger(claimingAddress) ||
  typeof ourDeviceName !== "string" ||
  (global.get("rvc_address_claim_lost") === true && !claimInProgress)
) {
  return null;
}

const competitorName = String(msg.payload.data_payload || "").toUpperCase();
const sourceAddressInt = parseInt(msg.payload.sourceAddress, 16);

if (!/^[0-9A-F]{16}$/.test(competitorName)) {
  node.warn(`Ignoring malformed ADDRESS_CLAIMED NAME: ${competitorName}`);
  return null;
}

// RV-C 3.3.3 transmits the NAME least-significant byte first, so payload byte 7
// -- which carries the arbitrary-address-capable bit -- is the most significant
// for arbitration. The bytes must be reversed before comparing; converting the
// wire string directly treats byte 0 as most significant and silently inverts
// which node wins the address.
function nameValue(wireName) {
  return BigInt(
    "0x" + wireName.match(/../g).reverse().join(""),
  );
}

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
  const ourNameValue = nameValue(ourDeviceName);
  const competitorNameValue = nameValue(competitorName);

  if (ourNameValue < competitorNameValue) {
    node.warn(
      `We WIN the conflict at address ${claimingAddress}; re-asserting our NAME ` +
        `${ourDeviceName} over competing NAME ${competitorName}.`,
    );
    const canId =
      ((6 << 26) | (0xee00 << 8) | claimingAddress) >>> 0;
    const assertion = {
      topic: "can/send",
      payload:
        `${canId.toString(16).padStart(8, "0").toUpperCase()}#` +
        ourDeviceName,
      address_claim_management: true,
    };
    // Output 3 drives the 250 ms quiet timer, which ends at
    // address_claim_success. Resetting it clears whatever was pending, and the
    // message that follows starts a fresh window; that node identifies the
    // claim from msg.claiming_address, so the restart carries the address and
    // nothing else. It is a trigger, not a frame.

    // Win branch
    return [
      null,            // 1: no retry
      assertion,       // 2: transmit
      claimInProgress  // 3: timer
        ? [{ reset: true }, { claiming_address: claimingAddress }]
        : null,
    ];
  } else {
    const addressHex = claimingAddress
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
    global.set("rvc_address_claim_lost", true);
    global.set("rvc_source_address", null);
    node.error(
      `RV-C ADDRESS LOST: address ${claimingAddress} (0x${addressHex}); ` +
        `our NAME ${ourDeviceName}; competing NAME ${competitorName}; ` +
        `competing NAME won. CAN traffic is blocked while claiming the next address.`,
    );
    flow.set("claim_in_progress", false);
    // Lose branch
    return [
      { topic: "address_claim_retry" },          // 1
      null,                                      // 2
      claimInProgress ? { reset: true } : null,  // 3
    ];
  }
}

// If we reach here, it's a claim for a different address, so ignore it.
return null;
