// An Aqua-Hot with no RV-C interface of its own, operated by a SilverLeaf
// TM-2xx module that drives what would otherwise be manual switches and speaks
// PROPRIETARY_A on the bus for it (the AQUAHOT_1 family). Confirmed against a
// 600-Series boiler behind a TM-225.
//
// Decodes PROP_REPORT_AQUAHOT_STATUS into one message per controllable output.
// Field layout is from the SilverLeaf TM-220, TM-225, TM-229 Application
// Document, page 9, converted from its 1-based byte and bit numbering:
//
//   payload byte 0        operation code, always A9
//   payload byte 1 bits 0-1   Diesel Burner    0 = Off, 1 = On
//   payload byte 1 bits 2-5   Electric Element 0 = Off, 1 = Low, 2 = High
//   payload byte 1 bits 6-7   Engine Pre-heat  0 = Off, 1 = On

const REPORT_OPERATION = 0xa9;

// Per RV-C Table 3.2.3b the maximum value of a field means Not Available, so a
// field reading all ones carries no state. Command frames use exactly that to
// say "leave this output alone", which is why it has to be distinguished from
// a real reading rather than decoded as one.
const NOT_AVAILABLE_2BIT = 0x3;
const NOT_AVAILABLE_4BIT = 0xf;

if (!msg.payload || typeof msg.payload !== "object") {
  node.warn("Invalid payload: expected object");
  return null;
}

const data_payload = msg.payload.data_payload;

if (!data_payload || data_payload.length < 4) {
  node.warn("Missing or short data_payload");
  return null;
}

// The operation code is the only reliable identifier in these frames. The DGN
// cannot serve: PROP_REPORT_AQUAHOT_STATUS is documented as EF## because the
// module addresses its reply to whichever node requested it, so the message
// carries no fixed destination. Without this check any proprietary frame that
// reached this node would be published as Aqua-Hot state.
const operation = parseInt(data_payload.substring(0, 2), 16);
if (operation !== REPORT_OPERATION) {
  return null;
}

const statusByte = parseInt(data_payload.substring(2, 4), 16);

const burner = statusByte & 0x3;
const element = (statusByte >> 2) & 0xf;
const preheat = (statusByte >> 6) & 0x3;

const outputMessages = [];

/** Report a state, unless the field says it has none. */
function report(instance, status) {
  if (status === null) return;
  outputMessages.push({ payload: { instance, status } });
}

const onOff = (value) => (value === NOT_AVAILABLE_2BIT ? null : value === 1 ? "ON" : "OFF");

report("burner", onOff(burner));
report("engine", onOff(preheat));

// The electric element is one 4-bit field with three values, not two
// independent bits. It is a three-position selector -- Off, Low, High -- and
// ac_1 and ac_2 are its Low and High positions rather than two elements.
//
// Reported as mutually exclusive because that is what the field is and what the
// Aqua-Hot's own panel shows. High does physically energise both elements, but
// reporting both entities on would offer an action that cannot be taken:
// turning off ac_1 while ac_2 is on is not a state the hardware has, and a
// switch that will not switch is worse than an incomplete reading. It would
// also disagree with the panel, which is the reference a technician checks.
const ELEMENT_STATES = {
  0: { ac_1: "OFF", ac_2: "OFF" }, // Off
  1: { ac_1: "ON", ac_2: "OFF" }, // Low  — first element only
  2: { ac_1: "OFF", ac_2: "ON" }, // High — both elements energised
};

if (element !== NOT_AVAILABLE_4BIT) {
  const states = ELEMENT_STATES[element];
  if (states) {
    report("ac_1", states.ac_1);
    report("ac_2", states.ac_2);
  } else {
    node.warn(`Undefined Aqua-Hot electric element value ${element}`);
  }
}

if (!outputMessages.length) return null;

return [outputMessages];
