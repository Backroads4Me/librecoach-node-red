// Writes AI dashboard prompt and HTML download page to /homeassistant/www/
// Input: msg.payload = rendered string from POST /api/template
// Output: two messages to File Write node (text file + HTML download page)

const content = msg.payload;
if (!content || typeof content !== "string") {
  node.error(
    "Invalid response from /api/template — expected rendered string",
    msg,
  );
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
  2. "Home Assistant masonry dashboard badges" — current syntax for
     type: masonry badges list, zone.home entity badge
  3. "Home Assistant tile card features climate" — confirm feature type names
     for climate-hvac-modes, target-temperature, climate-preset-modes

HA and mushroom update frequently. Do not rely solely on training data.

--- GLOBAL NAVIGATION ORDER (memorize this — it governs every badge list) ---
  1. Lights  2. Doors  3. AC  4. Heat  5. Shades  6. Locks  7. Tanks  8. Energy  9. Misc
Navigation paths: /dashboard-librecoach/<lowercase-name>
Icons in order: mdi:light-recessed, mdi:door, mdi:air-conditioner, mdi:heat-wave,
  mdi:roller-shade, mdi:lock, mdi:water, mdi:transmission-tower, mdi:cog-outline

--- STEP 2: REQUIRED CONSTRAINTS ---
• ONLY use: custom:mushroom-* cards and native HA cards (tile, gauge,
  entities, button, history-graph, glance, sensor)
• Do NOT use: custom:button-card, layout-card, or any other third-party cards
• Dashboard must be optimized for MOBILE (compact, touch-friendly)
• ALL views use type: masonry — no sections views
• Navigation badges: every view gets the full set (minus current view) — see STEP 4.1
• Group entities by area using type: vertical-stack with title: <area name>
• If an entity has no area, infer one from its name/entity_id — never use "(no area)" as a title
• Dashboard path prefix: /dashboard-librecoach/
• Use the exact mdi: icons shown in the examples below — do not substitute

--- STEP 3: PRE-PROCESSING — DO THIS BEFORE WRITING ANY YAML ---
Scan the entire entity data at the bottom of this file and produce a mental checklist:
  a. Which of the 9 views will be created? (apply the rules in the view list below)
  b. Record the final list of active views — this is the ONLY set of badges you will
     place on every view. Do not add or remove badges mid-generation.

View detection rules (create a view only if matching entities exist):
  path: lights    title: Lights    icon: mdi:lightbulb       (domain: light)
  path: doors     title: Doors     icon: mdi:door            (button entities for door open/close)
  path: ac        title: AC        icon: mdi:air-conditioner (climate with microair or ac in entity_id)
  path: heat      title: Heat      icon: mdi:heat-wave       (climate floor_heat, or light aquahot_*)
  path: shades    title: Shades    icon: mdi:roller-shade    (domain: cover)
  path: locks     title: Locks     icon: mdi:lock            (domain: lock)
  path: tanks     title: Tanks     icon: mdi:water           (sensor with tank_ in entity_id, plus water_pump and autofill switches)
  path: energy    title: Energy    icon: mdi:transmission-tower (battery/power sensors and switches)
  path: misc      title: Misc      icon: mdi:cog-outline     (everything else, including unrecognized types)

--- STEP 4: EXACT CARD TEMPLATES ---
Copy these patterns exactly, including icon values.

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

## Shade column headers (first vertical-stack in the Shades view, title: Shades):
  type: horizontal-stack
  cards:
    - type: horizontal-stack
      cards:
        - type: custom:mushroom-template-card
          primary: Night
          icon: mdi:moon-waning-crescent
          features_position: bottom
          color: yellow
    - type: custom:mushroom-template-card
      primary: Day
      icon: mdi:white-balance-sunny
      features_position: bottom
      color: yellow

## Night shade (cover) — inside horizontal-stack, left column:
  type: custom:mushroom-cover-card
  entity: cover.shade_7
  name: Windshield
  icon: mdi:moon-waning-crescent
  secondary_info: none
  fill_container: true
  primary_info: name

## Day shade (cover) — inside horizontal-stack, right column:
  type: custom:mushroom-cover-card
  entity: cover.shade_2
  name: Windshield
  icon: mdi:white-balance-sunny
  secondary_info: none

## Door (open/close button pair — each door is one vertical-stack with title):
  type: vertical-stack
  title: Bedroom
  cards:
    - show_name: true
      show_icon: false
      show_state: false
      type: button
      name: Open
      entity: light.switch_38
    - show_name: true
      show_icon: false
      show_state: false
      type: button
      name: Close
      entity: light.switch_39

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

## Floor heat zone (tile — use this exact features list, NOT thermostat):
  type: tile
  entity: climate.floor_heat_1
  name: Living Room
  vertical: false
  features:
    - type: climate-hvac-modes
    - type: climate-preset-modes
      style: dropdown
  features_position: bottom

## Aqua-Hot element (no brightness):
  type: custom:mushroom-light-card
  entity: light.aquahot_burner
  name: Diesel Burner
  secondary_info: none
  show_brightness_control: false

## Temperature sensor (for AC and Heat views):
  show_name: true
  show_icon: false
  show_state: true
  type: glance
  entities:
    - entity: sensor.cal_living_room_temp
      name:
        type: area
    - entity: sensor.cal_bedroom_temp
      name:
        type: area

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

## House battery state-of-charge gauge:
  type: gauge
  entity: sensor.librecoach_victron_system_battery_state_of_charge
  name: House
  min: 0
  max: 100
  needle: true
  severity:
    green: 75
    yellow: 25
    red: 0

## Starter/auxiliary battery voltage gauge:
  type: gauge
  entity: sensor.librecoach_victron_smartshunt_ip65_auxiliary_battery_voltage
  name: Starter
  min: 11.5
  max: 14.5
  needle: true
  severity:
    red: 0
    green: 12
    yellow: 14.2

## Power/inverter toggle button:
  show_name: true
  show_icon: true
  type: button
  icon: mdi:power
  entity: light.switch_57

--- STEP 4.1: NAVIGATION BADGE PROTOCOL ---
All views are masonry. Use a top-level badges: list on every view.
Omit only the badge for the current view. Keep the Global Navigation Order.

  badges:
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
      name: Doors
      icon: mdi:door
      tap_action:
        action: navigate
        navigation_path: /dashboard-librecoach/doors
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
      name: Energy
      icon: mdi:transmission-tower
      tap_action:
        action: navigate
        navigation_path: /dashboard-librecoach/energy
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
type: masonry. For each area:
• One type: vertical-stack with title: <area name>
• Inside the stack: one type: grid card (square: false, columns: 2) containing all lights for that area
• Dimmable lights (DIMMABLE=true) use the dimmable template above
• Non-dimmable lights (DIMMABLE=false) use the non-dimmable template
• Light groups (entity_id contains switch_g_) are always non-dimmable,
  place them at the end of their area grid

--- STEP 6: DOORS VIEW LAYOUT ---
type: masonry. Each door location is one vertical-stack with title: <location name>.
Inside the stack: Open button then Close button (show_name: true, show_icon: false, show_state: false).

--- STEP 7: AC VIEW LAYOUT ---
type: masonry.
• One vertical-stack title: MicroAir Zones containing all zone tile cards
• One vertical-stack title: Temperature containing glance cards — one for calibrated
  sensors (sensor.cal_*), one for humidity sensors (sensor.*_temp_humidity),
  using name: type: area for labels

--- STEP 8: HEAT VIEW LAYOUT ---
type: masonry.
• vertical-stack title: Aqua-Hot → type: grid (columns: 2, square: false) with aquahot_* light cards
• vertical-stack title: Floor Heat → tile cards for each floor_heat zone
• vertical-stack title: Temperature → type: grid (columns: 2, square: false) with sensor cards
  (graph: none, detail: 1, name: type: area) for air temperature sensors

--- STEP 9: SHADES VIEW LAYOUT ---
type: masonry. Each area is a type: vertical-stack with title: <area name>.
The two-column night|day layout within each stack uses type: horizontal-stack rows.

Structure:
  1. First vertical-stack — title: Shades (the column header row):
       type: horizontal-stack
         cards:
           - type: horizontal-stack   ← wraps the Night header
               cards:
                 - type: custom:mushroom-template-card  (Night, icon: mdi:moon-waning-crescent)
           - type: custom:mushroom-template-card        (Day, icon: mdi:white-balance-sunny)

  2. If cover.all_night and cover.all_day exist — vertical-stack title: All:
       type: horizontal-stack with night cover (fill_container: true, primary_info: name) + day cover

  3. For each area — vertical-stack title: <area>:
       One type: horizontal-stack per shade pair:
         - night cover (fill_container: true, primary_info: name, icon: mdi:moon-waning-crescent)
         - day cover   (secondary_info: none, icon: mdi:white-balance-sunny)

--- STEP 10: MISC VIEW LAYOUT ---
type: masonry.
• vertical-stack title: LibreCoach Tools containing a single type: entities card
  listing these entities in order (include only those present in the entity data):
    - button.librecoach_export_entities
    - text.rv_manufacturer
    - text.rv_model
    - text.rv_year
    - text.rv_other
    - button.librecoach_import_config
    - button.librecoach_export_config
    - switch.librecoach_record_unknown   (name: type: entity)
    - button.librecoach_export_unknown   (name: type: entity)

Skip any entity you are unsure about rather than guessing.

--- STEP 11: TANKS VIEW LAYOUT ---
type: masonry. Use a single vertical-stack title: Water Management (or no title):
• Water pump and autofill mushroom-entity-card switches FIRST
• Then tank gauges: fresh water uses the fresh gauge template,
  black/grey tanks use the inverted gauge template

--- STEP 12: ENERGY VIEW LAYOUT ---
type: masonry.
• vertical-stack title: Batteries → House SOC gauge + Starter voltage gauge + power toggle button

--- STEP 13: ENTITY DATA FORMAT ---
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

Only include entities where you have a clear card type from the templates above.
Skip any entity that doesn't clearly fit — do not guess or force entities into cards.

`;

const filename = "librecoach_dashboard_prompt.txt";
const fullContent = PROMPT_HEADER + content;
const lineCount = content
  .split("\n")
  .filter((l) => l.trim() && !l.startsWith("AREA")).length;

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
