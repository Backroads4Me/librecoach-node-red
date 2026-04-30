// A simple gate node to allow messages to pass only if Beta features are enabled.

// Check the global betaEnabled flag
const isBetaEnabled = global.get("betaEnabled");

// If beta is enabled, pass the message through unmodified.
// Otherwise, return null to drop the message and stop the flow along this path.
if (isBetaEnabled === true) {
  return msg;
}

return null;
