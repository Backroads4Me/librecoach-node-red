// Convert the data to a Map when initially storing it
const dgnMap = new Map(
  msg.payload.map((entry) => [entry.Hex.toString().toUpperCase(), entry.DGN]),
);

// PDU1 DGNs are listed in the reference without the leading data-page digit --
// REQUEST_FOR_DGN is "EA00", not "0EA00". decode_rvc_can builds a five
// character key, so those entries are indexed under both forms or the lookup
// misses and the message is routed as UNKNOWN.
for (const [hex, name] of [...dgnMap]) {
  if (hex.length === 4) {
    dgnMap.set("0" + hex, name);
  }
}

// Store the Map in global context
global.set("dgnMap", dgnMap);

// Count the number of records
const decoderCount = dgnMap.size;

// Update the node status to indicate success
node.status({
  fill: "green",
  shape: "dot",
  text: "Reference loaded",
});
return null;
