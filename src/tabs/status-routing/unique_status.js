// Passes through the first message with each unique dgn_name; drops duplicates.
let uniqueDecodedStatus = flow.get("uniqueDecodedStatus") || [];

const newMsgStr = JSON.stringify(msg.payload.dgn_name);

if (!uniqueDecodedStatus.includes(newMsgStr)) {
  uniqueDecodedStatus.push(newMsgStr);
  flow.set("uniqueDecodedStatus", uniqueDecodedStatus);
  return msg;
}

return null;
