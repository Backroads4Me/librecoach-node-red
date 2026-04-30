// Tally node (temporary diagnostic)
const counts = flow.get("dgnCounts") || {};
const name = msg.payload.dgn_name;
counts[name] = (counts[name] || 0) + 1;
flow.set("dgnCounts", counts);
return msg; // pass through unmodified
