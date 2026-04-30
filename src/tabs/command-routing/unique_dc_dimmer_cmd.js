// Retrieve existing messages from flow context, or initialize as empty array
let uniqueDcDimmerCmd = global.get("uniqueDcDimmerCmd") || [];

let newMsgStr = JSON.stringify(msg.payload.data_payload);

// Check if it's a new unique message
if (!uniqueDcDimmerCmd.includes(newMsgStr)) {
    uniqueDcDimmerCmd.push(newMsgStr);
    global.set("uniqueDcDimmerCmd", uniqueDcDimmerCmd);

    // Only return if new
    return msg;
}

// Return nothing if duplicate
return null;