// Writes AI dashboard prompt and HTML download page to /homeassistant/www/
// Input: msg.payload = rendered string from POST /api/template
// Output: two messages to File Write node (text file + HTML download page)

const content = msg.payload;
if (!content || typeof content !== "string") {
  node.error("Invalid response from /api/template — expected rendered string", msg);
  node.status({ fill: "red", shape: "ring", text: "Template render failed" });
  return null;
}

const PROMPT_HEADER = `You are building a Home Assistant dashboard YAML for an RV control system
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
• Only create views that have relevant entities in the data below
• Only include navigation badges for views that were actually created
• The badge entity should always be zone.home (it exists on every HA install)
• type: masonry for the Lights view; type: sections (max_columns: 4) for all others
• Group entities by area using mushroom-title-card headers (alignment: center)
• If an entity has no area, infer one from its name/entity_id — never use "(no area)" as a header
• Dashboard path prefix: /dashboard-librecoach/
• Use the exact mdi: icons shown in the examples below — do not substitute

--- STEP 3: VIEWS TO CREATE (IF APPLICABLE) ---
Create a view for each category only if the entity data contains matching entities.
Use these path names and icons when creating a view:

  path: lights    title: Lights    icon: mdi:lightbulb       (domain: light)
  path: shades    title: Shades    icon: mdi:roller-shade    (domain: cover)
  path: locks     title: Locks     icon: mdi:lock            (domain: lock)
  path: ac        title: AC        icon: mdi:air-conditioner (climate with microair or ac in entity_id)
  path: heat      title: Heat      icon: mdi:heat-wave       (climate floor_heat, or light aquahot_*)
  path: tanks     title: Tanks     icon: mdi:water           (sensor with tank_ in entity_id, plus water_pump and autofill switches)
  path: misc      title: Misc      icon: mdi:cog-outline     (everything else, including unrecognized types)

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

## Shade column header (Night):
  type: custom:mushroom-template-card
  primary: Night
  icon: mdi:moon-waning-crescent
  features_position: bottom
  grid_options:
    columns: 6
    rows: 1
  color: yellow

## Shade column header (Day):
  type: custom:mushroom-template-card
  primary: Day
  icon: mdi:white-balance-sunny
  features_position: bottom
  grid_options:
    columns: 6
    rows: 1
  color: yellow

## Night shade (cover):
  type: custom:mushroom-cover-card
  entity: cover.shade_7
  name: Windshield
  icon: mdi:moon-waning-crescent
  secondary_info: none

## Day shade (cover):
  type: custom:mushroom-cover-card
  entity: cover.shade_2
  name: Windshield
  icon: mdi:white-balance-sunny
  secondary_info: none

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

## Navigation badges — include one per view that was created, on every view:
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
Use type: sections (max_columns: 4) with a SINGLE type: grid section containing
all shade cards laid out flat. The two-column effect comes from sub-grids with
grid_options: columns: 6 (half of the 12-column grid) sitting side by side.

Structure of the flat card list inside the single grid section:
  1. Night column header (mushroom-template-card, grid_options: columns: 6)
  2. Day column header  (mushroom-template-card, grid_options: columns: 6)
  3. If cover.all_night and cover.all_day group entities exist:
       - mushroom-title-card "All"
       - type: grid, columns: 1, grid_options: columns: 6  ← night group card
       - type: grid, columns: 1, grid_options: columns: 6  ← day group card
  4. For each area with shades (repeat the pattern):
       - mushroom-title-card with area name
       - type: grid, columns: 1, grid_options: columns: 6  ← all night covers for area
       - type: grid, columns: 1, grid_options: columns: 6  ← all day covers for area

Each inner type: grid that holds shade cards uses:
  columns: 1
  grid_options:
    columns: 6
    rows: auto
  square: false

If an area has only night OR only day shades, still emit both column slots but
leave the missing side as an empty grid (cards: []) so columns stay aligned.

--- STEP 7: TANKS VIEW LAYOUT ---
Use type: sections (max_columns: 4).
• Tank gauges (sensor with tank_ in entity_id) use the gauge templates above
• Water pump and autofill switches belong on this view — use the switch template
• Group tank gauges together, then water management switches below them

--- STEP 8: ENTITY DATA FORMAT ---
The 6-column pipe-delimited data below lists only user-labeled entities.
  AREA          — HA area; use for grouping. If AREA is "(no area)", infer a
                  logical room or category from the entity_id and friendly_name
                  (e.g. "Living Room", "Bedroom", "Exterior") — never display
                  a header labeled "(no area)"
  DOMAIN        — entity type (light, cover, lock, climate, sensor, switch, button)
  ENTITY_ID     — use exactly as-is in the entity: field
  FRIENDLY_NAME — use as the name: field on the card
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
Do not truncate or summarize.

Include all entities you have a clear card type for. For entity types not
covered by the templates above, use your best judgment to pick the closest
matching card. Do not skip entities silently — if no specific template fits,
place them in the Misc view using custom:mushroom-entity-card.

--- ENTITY DATA ---
AREA|DOMAIN|ENTITY_ID|FRIENDLY_NAME|DEVICE_CLASS|DIMMABLE
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
