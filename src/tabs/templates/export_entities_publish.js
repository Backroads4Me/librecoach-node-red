// Writes AI dashboard prompt and HTML download page to /homeassistant/www/
// Input: msg.payload = rendered string from POST /api/template
// Output: two messages to File Write node (text file + HTML download page)

const content = msg.payload;
if (!content || typeof content !== "string") {
  node.error("Invalid response from /api/template — expected rendered string", msg);
  node.status({ fill: "red", shape: "ring", text: "Template render failed" });
  return null;
}

const PROMPT_HEADER = `============================================================
LIBRECOACH AI DASHBOARD GENERATION PROMPT
============================================================

You are building a Home Assistant dashboard YAML for an RV control system
called LibreCoach. The dashboard title is "LibreCoach". Use the entity data
at the bottom of this file.

--- STEP 1: WEB SEARCH (REQUIRED BEFORE WRITING ANY YAML) ---
Search the web for current documentation on:
  1. "lovelace-mushroom" — current card types, options, feature lists,
     and any breaking changes or deprecations since 2024
  2. "Home Assistant sections dashboard YAML" — current syntax for
     type: sections, max_columns, grid_options, badges_position
  3. "Home Assistant tile card features climate" — confirm feature type names
     for climate-hvac-modes, target-temperature, climate-preset-modes

HA and mushroom update frequently. Do not rely solely on training data.

--- STEP 2: REQUIRED CONSTRAINTS ---
• ONLY use: custom:mushroom-* cards and native HA cards (tile, gauge,
  entities, button, thermostat, history-graph, glance, sensor)
• Do NOT use: custom:button-card, layout-card, or any other third-party cards
• Dashboard must be optimized for MOBILE (compact, touch-friendly)
• Every view must have navigation badges linking to all other views
• The badge entity should always be zone.home (it exists on every HA install)
• type: masonry for the Lights view; type: sections (max_columns: 4) for all others
• Group entities by area using mushroom-title-card headers (alignment: center)
• Dashboard path prefix: /dashboard-librecoach/
• Use the exact mdi: icons shown in the examples below — do not substitute

--- STEP 3: VIEWS TO CREATE ---
Create exactly these views (use path names and icons as shown):

  path: lights    title: Lights    icon: mdi:lightbulb
  path: shades    title: Shades    icon: mdi:roller-shade
  path: locks     title: Locks     icon: mdi:lock
  path: ac        title: AC        icon: mdi:air-conditioner
  path: heat      title: Heat      icon: mdi:heat-wave
  path: tanks     title: Tanks     icon: mdi:water
  path: misc      title: Misc      icon: mdi:cog-outline

--- STEP 4: EXACT CARD TEMPLATES ---
Copy these patterns exactly, including icon values.

## Section title header:
  type: custom:mushroom-title-card
  title: Living Room
  alignment: center

## Light (dimmable, DIMMABLE=true):
  type: custom:mushroom-light-card
  entity: light.switch_4
  name: Entry Ceiling
  secondary_info: none
  show_brightness_control: true
  use_light_color: false
  collapsible_controls: false
  fill_container: false

## Light (non-dimmable, DIMMABLE=false):
  type: custom:mushroom-light-card
  entity: light.switch_g_1
  name: Entry Scene
  secondary_info: none
  show_brightness_control: false

## Night shade (cover) — icon: mdi:moon-waning-crescent:
  type: custom:mushroom-cover-card
  entity: cover.shade_7
  name: Windshield
  icon: mdi:moon-waning-crescent
  secondary_info: none
  fill_container: true
  primary_info: name

## Day shade (cover) — icon: mdi:white-balance-sunny:
  type: custom:mushroom-cover-card
  entity: cover.shade_2
  name: Windshield
  icon: mdi:white-balance-sunny
  secondary_info: none
  fill_container: true
  primary_info: name

## Lock:
  show_name: true
  show_icon: true
  type: button
  entity: lock.lock_1
  tap_action:
    action: toggle

## MicroAir AC zone (tile — use this exact features list):
  type: tile
  entity: climate.librecoach_climate_microair_zone_1
  name: Zone 1
  features:
    - type: climate-hvac-modes
    - type: target-temperature
  grid_options:
    columns: 6
    rows: 3

## Floor heat zone (thermostat — use this exact features list):
  type: thermostat
  entity: climate.floor_heat_1
  name: Living Room
  features:
    - type: climate-hvac-modes
    - type: climate-preset-modes
      style: dropdown

## Aqua-Hot element (no brightness):
  type: custom:mushroom-light-card
  entity: light.aquahot_burner
  name: Diesel Burner
  secondary_info: none
  show_brightness_control: false

## Fresh water tank gauge:
  type: gauge
  entity: sensor.tank_fresh
  name: Fresh Tank
  severity:
    green: 60
    yellow: 40
    red: 0

## Black/grey tank gauge (inverted — full is bad):
  type: gauge
  entity: sensor.tank_black
  name: Black Tank
  needle: false
  severity:
    green: 0
    yellow: 50
    red: 60

## Switch (water pump, autofill):
  type: custom:mushroom-entity-card
  entity: switch.water_pump
  name: Water Pump
  primary_info: name
  secondary_info: none
  tap_action:
    action: toggle

## Navigation badges — include ALL of these on EVERY view:
  - type: entity
    entity: zone.home
    show_name: true
    show_state: false
    show_icon: true
    show_entity_picture: false
    name: Lights
    icon: mdi:light-recessed
    tap_action:
      action: navigate
      navigation_path: /dashboard-librecoach/lights
  - type: entity
    entity: zone.home
    show_name: true
    show_state: false
    show_icon: true
    show_entity_picture: false
    name: Shades
    icon: mdi:roller-shade
    tap_action:
      action: navigate
      navigation_path: /dashboard-librecoach/shades
  - type: entity
    entity: zone.home
    show_name: true
    show_state: false
    show_icon: true
    show_entity_picture: false
    name: Locks
    icon: mdi:lock
    tap_action:
      action: navigate
      navigation_path: /dashboard-librecoach/locks
  - type: entity
    entity: zone.home
    show_name: true
    show_state: false
    show_icon: true
    show_entity_picture: false
    name: AC
    icon: mdi:air-conditioner
    tap_action:
      action: navigate
      navigation_path: /dashboard-librecoach/ac
  - type: entity
    entity: zone.home
    show_name: true
    show_state: false
    show_icon: true
    show_entity_picture: false
    name: Heat
    icon: mdi:heat-wave
    tap_action:
      action: navigate
      navigation_path: /dashboard-librecoach/heat
  - type: entity
    entity: zone.home
    show_name: true
    show_state: false
    show_icon: true
    show_entity_picture: false
    name: Tanks
    icon: mdi:water
    tap_action:
      action: navigate
      navigation_path: /dashboard-librecoach/tanks
  - type: entity
    entity: zone.home
    show_name: true
    show_state: false
    show_icon: true
    show_entity_picture: false
    name: Misc
    icon: mdi:cog-outline
    tap_action:
      action: navigate
      navigation_path: /dashboard-librecoach/misc

--- STEP 5: LIGHTS VIEW LAYOUT ---
Use type: masonry. For each area:
• One mushroom-title-card header
• One grid card (columns: 2) containing all lights for that area
• Dimmable lights (DIMMABLE=true) use the dimmable template above
• Non-dimmable lights (DIMMABLE=false) use the non-dimmable template
• Light groups (entity_id contains switch_g_) are always non-dimmable,
  place them at the end of their area grid

--- STEP 6: SHADES VIEW LAYOUT ---
Use type: sections (max_columns: 4). For each area that has shades:
• One mushroom-title-card header spanning the section
• A horizontal-stack with two grid cards (columns: 1 each):
    Left column:  all night shades (icon: mdi:moon-waning-crescent)
    Right column: all day shades   (icon: mdi:white-balance-sunny)
• If an area has only one shade type, use a single grid (no horizontal-stack)

--- STEP 7: ENTITY DATA FORMAT ---
The 7-column pipe-delimited data below lists only user-labeled entities.
  AREA          — HA area; use for grouping; "(no area)" entities go last
  DOMAIN        — entity type (light, cover, lock, climate, sensor, switch, button)
  ENTITY_ID     — use exactly as-is in the entity: field
  FRIENDLY_NAME — use as the name: field on the card
  STATE         — current value; context only, do not display
  DEVICE_CLASS  — HA device class hint
  DIMMABLE      — true/false; drives show_brightness_control on light cards

--- RV-SPECIFIC NOTES ---
  switch_N     = interior light (N is RV-C instance number)
  switch_g_N   = light group or scene (always non-dimmable)
  shade_N      = motorized window shade
  aquahot_*    = diesel hydronic heating elements (not HVAC)
  floor_heat_N = in-floor radiant heat zone
  Areas: Entry, Living Room, Kitchen, Bedroom, Bath, Potty, Exterior

--- OUTPUT ---
Produce complete, valid HA dashboard YAML ready to paste into
Settings → Dashboards → LibreCoach → Raw Config Editor.
Do not truncate or summarize. Include every entity from the data below.

============================================================
ENTITY DATA
AREA|DOMAIN|ENTITY_ID|FRIENDLY_NAME|STATE|DEVICE_CLASS|DIMMABLE
============================================================
`;

const filename = "librecoach_dashboard_prompt.txt";
const fullContent = PROMPT_HEADER + content;
const lineCount = content.split("\n").filter((l) => l.trim() && !l.startsWith("AREA")).length;

const textMsg = {
  filename: `/homeassistant/www/${filename}`,
  payload: fullContent,
  entityCount: lineCount,
  exportFilename: filename,
};

const htmlMsg = {
  filename: "/homeassistant/www/librecoach_download_dashboard.html",
  payload: `<!DOCTYPE html>
<html><head><title>LibreCoach AI Dashboard Prompt</title></head>
<body>
<script>
var a = document.createElement("a");
a.href = "/local/${filename}";
a.download = "${filename}";
document.body.appendChild(a);
a.click();
setTimeout(function() { window.close(); }, 1000);
</script>
<p>Your download should start automatically. If not, <a href="/local/${filename}" download="${filename}">click here</a>.</p>
</body></html>`,
  entityCount: lineCount,
  exportFilename: filename,
};

node.status({ fill: "green", shape: "dot", text: `${lineCount} entities` });
return [[textMsg, htmlMsg]];
