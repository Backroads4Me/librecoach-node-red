// Passes through the first message with each unique dgn_name; drops duplicates.
let uniqueCommand = flow.get("uniqueCommand") || [];

const newMsgStr = JSON.stringify(msg.payload.dgn_name);

if (!uniqueCommand.includes(newMsgStr)) {
    uniqueCommand.push(newMsgStr);
    flow.set("uniqueCommand", uniqueCommand);
    return msg;
}

return null;
