// Status Updater for Autofill

// Decodes the incoming autofill message status to a final "on" or "off"
function decodeAutofillMessage(dgn, data) {
  let finalStatus = "off";

  // Check the first byte for the operating status
  if (data.length > 0) {
    const operatingStatusBits = data[0] & 0x03; // Mask for bits 0-1
    if (operatingStatusBits === 1) {
      // 01b = AutoFill on
      finalStatus = "on";
    }
  }

  const result = {
    dgn: dgn,
    dgn_name: "AUTOFILL_STATUS",
    instance: "autofill", // Hard-code to string instance name
    status: finalStatus,
  };

  return result;
}

// === Main Logic ===
if (!msg.payload || typeof msg.payload !== "object") {
  node.warn("Invalid payload: expected an object");
  return null;
}
const { dgn, data_payload } = msg.payload;
if (!dgn || !data_payload) {
  node.warn("Missing required fields: dgn and/or data_payload");
  return null;
}
const dataBytes = [];
for (let i = 0; i < data_payload.length; i += 2) {
  dataBytes.push(parseInt(data_payload.substring(i, i + 2), 16));
}
const decodedData = decodeAutofillMessage(dgn, dataBytes);
msg.payload = { ...msg.payload, ...decodedData };
return msg;
