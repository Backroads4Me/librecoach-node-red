// Sets up HA Template API call to render the full LibreCoach entity list with area info
// Input: msg (triggered by export button)
// Output: msg configured for POST /api/template

const haBaseUrl = "http://supervisor/core";
const haToken = env.get("SUPERVISOR_TOKEN");

if (!haToken) {
  node.error("SUPERVISOR_TOKEN not configured.", msg);
  node.status({ fill: "red", shape: "ring", text: "No Supervisor token" });
  return null;
}

msg.headers = {
  Authorization: `Bearer ${haToken}`,
  "Content-Type": "application/json",
};
msg.url = `${haBaseUrl}/api/template`;

// Jinja2 template rendered by HA — catches every LibreCoach entity via
// device manufacturer check (authoritative) plus keyword fallbacks.
// Sorted by area so output groups naturally by room for dashboard building.
const template = `{%- set ns = namespace(rows=[]) -%}
{%- for s in states -%}
{%- set eid = s.entity_id -%}
{%- set domain = eid.split('.')[0] -%}
{%- if domain == 'automation' -%}{%- continue -%}{%- endif -%}
{%- if 'librecoach_victron_' in eid -%}{%- continue -%}{%- endif -%}
{%- set dev_id = device_id(eid) -%}
{%- set is_lc = dev_id is not none and device_attr(dev_id, 'manufacturer') == 'LibreCoach' -%}
{%- if is_lc or 'switch_' in eid or 'tank_' in eid or 'thermostat' in eid or 'aquahot' in eid or 'generator' in eid or 'hughes_' in eid or 'waterheater' in eid or 'circ_pump' in eid or 'battery_house' in eid or 'signal_quality' in eid or 'librecoach' in eid or 'rv_' in eid -%}
{%- set area = area_name(eid) | default('(no area)', true) -%}
{%- set fname = s.attributes.friendly_name | default(eid) -%}
{%- if fname.startswith('LibreCoach:') and domain not in ('button', 'text', 'select') and 'record_unknown' not in eid -%}{%- continue -%}{%- endif -%}
{%- if 'switch_' in eid and fname.startswith('Switches ') -%}{%- continue -%}{%- endif -%}
{%- if s.state in ('unavailable', 'unknown') and domain not in ('button', 'text', 'select') -%}{%- continue -%}{%- endif -%}
{%- set dc = s.attributes.device_class | default('') -%}
{%- set unit = s.attributes.unit_of_measurement | default('') -%}
{%- set dimmable = 'true' if 'brightness' in s.attributes.get('supported_color_modes', []) else 'false' -%}
{%- set ns.rows = ns.rows + [area ~ '|' ~ domain ~ '|' ~ eid ~ '|' ~ fname ~ '|' ~ dc ~ '|' ~ unit ~ '|' ~ dimmable] -%}
{%- endif -%}
{%- endfor -%}
AREA|DOMAIN|ENTITY_ID|FRIENDLY_NAME|DEVICE_CLASS|UNIT|DIMMABLE
{%- for row in ns.rows | sort %}
{{ row }}
{%- endfor %}`;

msg.payload = { template };
return msg;
