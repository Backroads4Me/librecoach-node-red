// Unique Filter for Unknown Messages

// Retrieve existing messages from flow context, or initialize as empty array
let uniqueUnknown = flow.get("uniqueUnknown") || [];

let newMsgStr = JSON.stringify(msg.payload.dgn);

// Check if it's a new unique message
if (!uniqueUnknown.includes(newMsgStr)) {
    uniqueUnknown.push(newMsgStr);
    flow.set("uniqueUnknown", uniqueUnknown);

    // Only return if new
    return msg;
}

// Return nothing if duplicate
return null;
