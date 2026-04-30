// RV-C Address Claim - Send Initial Claim
// Generates a persistent unique ID, selects an address, and broadcasts the
// ADDRESS_CLAIMED message (DGN EE00h) to claim the address.

// --- Step 1: Handle Manual Reset Command (if triggered) ---
if (msg.topic === "reset_device_id") {
  // Clear the saved unique ID from persistent storage
  global.set("my_persistent_rvc_id", null, "file");
  // Reset the address attempt counter to start fresh
  context.set("address_attempt", null);
  node.warn(
    "Persistent DEVICE_NAME cleared. Generating a new one and starting claim...",
  );
  // By not returning, we allow the script to continue and generate a new ID immediately.
}

// --- Configuration ---
const STARTING_ADDRESS = 223;
const MIN_ADDRESS = 208;

// --- Step 2: Create or Retrieve a Persistent Unique DEVICE_NAME ---
let uniqueId = global.get("my_persistent_rvc_id", "file");

if (!uniqueId) {
  // No ID found, so generate a new one.
  const randomSerial = Math.floor(Math.random() * 0x1fffff);
  const randomSerialHex = randomSerial
    .toString(16)
    .padStart(6, "0")
    .toUpperCase();
  uniqueId = "8000000000" + randomSerialHex;

  // Save this new ID to the global context for future use.
  global.set("my_persistent_rvc_id", uniqueId, "file");
  //node.warn("Generated and saved a new persistent DEVICE_NAME: " + uniqueId);
}
const DEVICE_NAME = uniqueId;

// --- Step 3: Select an Address to Claim ---
const usedAddresses = new Set(flow.get("used_addresses") || []);
let addressToTry = context.get("address_attempt") || STARTING_ADDRESS;

if (msg.topic === "address_claim_retry") {
  addressToTry--;
  node.warn(`Lost address conflict. Trying next address: ${addressToTry}`);
}

while (usedAddresses.has(addressToTry) && addressToTry >= MIN_ADDRESS) {
  addressToTry--;
  node.warn(
    `Address ${addressToTry + 1} is known to be in use, skipping to ${addressToTry}`,
  );
}

if (addressToTry < MIN_ADDRESS) {
  node.error(
    `Exhausted all addresses in the valid range (${STARTING_ADDRESS}-${MIN_ADDRESS}). Address claiming failed.`,
  );
  flow.set("claim_in_progress", false);
  return null;
}

context.set("address_attempt", addressToTry);

// --- Step 4: Build and Send the Claim Message ---
const DGN = "EE00";
const priority = 6;
const canIdNum = (priority << 26) | (parseInt(DGN, 16) << 8) | addressToTry;
const canIdHex = canIdNum.toString(16).padStart(8, "0").toUpperCase();
const data_payload = DEVICE_NAME;
const canMessage = `${canIdHex}#${data_payload}`;

flow.set("claiming_address", addressToTry);
flow.set("claim_in_progress", true);
flow.set("our_device_name", DEVICE_NAME);

msg.payload = canMessage;
msg.topic = "can/send";
msg.claiming_address = addressToTry;

node.log(
  `Attempting to claim address ${addressToTry} (0x${addressToTry.toString(16).toUpperCase()})`,
);

return msg;
