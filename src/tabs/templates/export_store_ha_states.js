// Stores Home Assistant states response
// Input: msg.payload = response from GET /api/states (array of state objects)
// Output: msg with states array ready for export function

// Validate response
if (!msg.payload || !Array.isArray(msg.payload)) {
  node.error("Invalid response from /api/states - expected array", msg);
  return null;
}

// Store states in message for downstream processing
msg.states = msg.payload;

// Log count for debugging
node.status({
  fill: "blue",
  shape: "dot",
  text: `${msg.states.length} entities`,
});

return msg;
