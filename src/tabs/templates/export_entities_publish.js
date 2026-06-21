// Writes AI dashboard prompt and HTML download page to /homeassistant/www/
// Input: msg.payload = rendered string from POST /api/template
//        msg.topic   = trigger topic; "/entities/default/" selects the
//                      standard-cards-only variant (no custom: cards)
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
• If FRIENDLY_NAME is blank or equals the entity_id, derive a readable name from the
  entity_id (drop the domain, replace underscores with spaces, Title-Case it) — never display a raw entity_id
• Goal: place ~95% of entities. If you can't confidently fit one on a specific view,
  put it in Misc — never silently drop an entity
• Dashboard path prefix: /dashboard-librecoach/
• Use the exact mdi: icons shown in the examples below — do not substitute

--- STEP 3: PRE-PROCESSING — DO THIS BEFORE WRITING ANY YAML ---
Scan the entire entity data at the bottom of this file and produce a mental checklist:
  a. Which of the 9 views will be created? (apply the rules in the view list below)
  b. Record the final list of active views — this is the ONLY set of badges you will
     place on every view. Do not add or remove badges mid-generation.

View detection rules (create a view only if matching entities exist):
  path: lights    title: Lights    icon: mdi:lightbulb       (domain: light, EXCLUDING door open/close lights — those go to Doors)
  path: doors     title: Doors     icon: mdi:door            (light entities whose FRIENDLY_NAME contains "door open" or "door close")
  path: ac        title: AC        icon: mdi:air-conditioner (climate with microair or ac in entity_id)
  path: heat      title: Heat      icon: mdi:heat-wave       (any OTHER climate — floor_heat_*, thermostat_zone_*, furnace_* — plus light aquahot_*)
  path: shades    title: Shades    icon: mdi:roller-shade    (domain: cover)
  path: locks     title: Locks     icon: mdi:lock            (domain: lock)
  path: tanks     title: Tanks     icon: mdi:water           (sensor with tank_ in entity_id, plus water_pump and autofill switches)
  path: energy    title: Energy    icon: mdi:transmission-tower (battery/power sensors and switches)
  path: misc      title: Misc      icon: mdi:cog-outline     (EVERYTHING not placed on another view — never drop an entity; see STEP 10)

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

## Doors view — wrap EVERY door in ONE 2-column grid; each door is a vertical-stack:
  type: grid
  square: false
  columns: 2
  cards:
    - type: vertical-stack
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
    - type: vertical-stack
      title: Bath
      cards:
        - { type: button, name: Open, show_name: true, show_icon: false, show_state: false, entity: light.switch_28 }
        - { type: button, name: Close, show_name: true, show_icon: false, show_state: false, entity: light.switch_31 }

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

## Switch (water pump, autofill) — blue tint signals water system:
  type: custom:mushroom-entity-card
  entity: switch.water_pump
  name: Water Pump
  primary_info: name
  secondary_info: none
  color: blue
  tap_action:
    action: toggle

## Battery gauge — STATE OF CHARGE (use when that battery sensor's UNIT is "%"):
## Use the actual battery SOC sensor from the entity data below — exact IDs vary
## by hardware (most coaches have no Victron gear); never assume this example ID.
  type: gauge
  entity: sensor.battery_house_state_of_charge
  name: House
  min: 0
  max: 100
  needle: true
  severity:
    green: 75
    yellow: 25
    red: 0

## Battery gauge — VOLTAGE (use when that battery sensor's UNIT is "V"; house or starter):
## Use the actual voltage sensor from the entity data below — exact IDs vary by
## hardware (most coaches have no Victron gear); never assume this example ID.
  type: gauge
  entity: sensor.battery_starter_voltage
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
type: masonry. Wrap ALL door locations in a single type: grid (square: false, columns: 2)
so each door occupies a half-width cell — never let a door card span the full view width.
Each door location is one type: vertical-stack with title: <location name> inside that grid,
holding the Open button then the Close button (show_name: true, show_icon: false, show_state: false).
Door entities are lights named "<place> door open" / "<place> door close"; pair them by place.

--- STEP 7: AC VIEW LAYOUT ---
type: masonry.
• One vertical-stack title: MicroAir Zones containing a type: grid (columns: 2, square: false)
  with all zone tile cards inside it — never place zone tiles loose in the stack
• One vertical-stack title: Temperature containing a glance card that lists every
  sensor with DEVICE_CLASS temperature (use name: type: area, or the friendly name
  when the sensor has no area)

--- STEP 8: HEAT VIEW LAYOUT ---
type: masonry.
• vertical-stack title: Aqua-Hot → type: grid (columns: 2, square: false) with aquahot_* light cards
• vertical-stack title: Floor Heat → type: grid (columns: 2, square: false) with tile
  cards for each floor_heat zone inside it
• vertical-stack title: Zone Thermostats → type: grid (columns: 2, square: false) with
  tile cards for every thermostat_zone_* or furnace_* climate inside it
• vertical-stack title: Temperature → type: grid (columns: 2, square: false) with sensor cards
  (graph: none, detail: 1, name: type: area) for sensors with DEVICE_CLASS temperature

--- STEP 9: SHADES VIEW LAYOUT ---
type: masonry. Each area is a type: vertical-stack with title: <area name>.
The two-column night|day layout uses a single type: grid (columns: 2, square: false)
inside each vertical-stack — NOT individual horizontal-stacks per pair.
Using a grid guarantees every card is half-width, including lone unpaired shades.

Structure:
  1. First vertical-stack — title: Shades (the column header row):
       type: horizontal-stack
         cards:
           - type: horizontal-stack   ← wraps the Night header
               cards:
                 - type: custom:mushroom-template-card  (Night, icon: mdi:moon-waning-crescent)
           - type: custom:mushroom-template-card        (Day, icon: mdi:white-balance-sunny)

  2. If cover.all_night and cover.all_day exist — vertical-stack title: All:
       type: grid (columns: 2, square: false) with the night cover then the day cover

  3. For each area — vertical-stack title: <area>:
       type: grid (columns: 2, square: false) containing covers in this order:
         night cover first (fill_container: true, primary_info: name, icon: mdi:moon-waning-crescent),
         then its paired day cover (secondary_info: none, icon: mdi:white-balance-sunny).
       Repeat for each pair within the area. Unpaired covers go in the same grid as a
       single half-width card — never place any shade card outside a grid.
Pair shades by base FRIENDLY_NAME: the one containing "night" is the night cover, "day" the day cover.

--- STEP 9.1: LOCKS VIEW LAYOUT ---
type: masonry. All locks go in a single vertical-stack title: Locks, regardless of
their AREA value. Inside that stack: one type: grid (square: false, columns: 2)
containing every lock button card. Do NOT split locks by area — ignore AREA for locks.
The button's own name (show_name: true, show_icon: true) identifies each lock.

--- STEP 10: MISC VIEW LAYOUT ---
type: masonry.
• Use this exact YAML structure for the LibreCoach Tools card (include only entities
  present in the entity data; omit the entire entry if the entity is absent):

  type: vertical-stack
  cards:
    - type: entities
      title: LibreCoach Tools
      entities:
        - entity: button.librecoach_export_entities
          name:
            type: entity
        - entity: button.librecoach_export_entities_default
          name:
            type: entity
        - entity: text.rv_manufacturer
        - entity: text.rv_model
        - entity: text.rv_year
        - entity: text.rv_other
        - entity: button.librecoach_import_config
          name:
            type: entity
        - entity: button.librecoach_export_config
          name:
            type: entity
        - entity: switch.librecoach_record_unknown
          name:
            type: entity
        - entity: button.librecoach_export_unknown
          name:
            type: entity

• AFTER the Tools card, add a vertical-stack title: Other holding every entity not shown
  on any other view (e.g. generator_*, furnace_* status, geo_*, update): group related
  sensors/binary_sensors into type: entities cards, others as tile/button cards.
  This is the catch-all — do not silently drop entities.

--- STEP 11: TANKS VIEW LAYOUT ---
type: masonry. Use a single vertical-stack title: Water Management (or no title):
• Water pump and autofill mushroom-entity-card switches FIRST — always include color: blue
• Then tank gauges: fresh water uses the fresh gauge template,
  black/grey tanks use the inverted gauge template
• Any other water-system switch (e.g. dump valves) also gets color: blue

--- STEP 12: ENERGY VIEW LAYOUT ---
type: masonry.
• vertical-stack title: Batteries → one gauge per battery sensor (pick the SOC gauge
  when its UNIT is "%", the Voltage gauge when its UNIT is "V"), then the power/inverter
  toggle button if one exists

--- STEP 13: ENTITY DATA FORMAT ---
The 7-column pipe-delimited data below lists LibreCoach entities (some may be unlabeled).
  AREA          — HA area; use for grouping. If AREA is "(no area)", infer a
                  logical room or category from the entity_id and friendly_name
                  (e.g. "Living Room", "Bedroom", "Exterior") — never display
                  a header labeled "(no area)"
  DOMAIN        — entity type (light, cover, lock, climate, sensor, switch, button)
  ENTITY_ID     — use exactly as-is in the entity: field
  FRIENDLY_NAME — use as the name: field on the card. If blank or identical to ENTITY_ID,
                  derive a short human name from the entity_id (drop domain, de-underscore,
                  Title-Case) — never show a raw entity_id as a card name
  DEVICE_CLASS  — HA device class hint
  UNIT          — unit_of_measurement (e.g. %, V, °F); use to pick gauge ranges
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

Use the closest matching card template for each entity. If an entity truly has no
sensible card, place it in the Misc → Other catch-all rather than discarding it.

`;

const DEFAULT_PROMPT_HEADER = `You are building a Home Assistant dashboard YAML for an RV control system
called LibreCoach. The dashboard title is "LibreCoach". Use the entity data
at the bottom of this file.

--- IMPORTANT: STANDARD CARDS ONLY ---
This dashboard MUST work on a stock Home Assistant install with NO custom cards
or HACS frontend resources installed. Use ONLY built-in Home Assistant cards.
NEVER output a card whose type starts with "custom:" — no mushroom, no
button-card, no layout-card, no auto-entities, nothing third-party. If you are
tempted to reach for a custom card, use the native equivalent shown below.

--- STEP 1: WEB SEARCH (REQUIRED BEFORE WRITING ANY YAML) ---
Search the web for current documentation on:
  1. "Home Assistant tile card" — current features list (light-brightness,
     cover-open-close, cover-position, climate-hvac-modes, target-temperature,
     climate-preset-modes, toggle) and any changes since 2024
  2. "Home Assistant masonry dashboard badges" — current syntax for
     type: masonry badges list, zone.home entity badge
  3. "Home Assistant gauge card" and "entities card" — confirm current options

HA updates frequently. Do not rely solely on training data.

--- GLOBAL NAVIGATION ORDER (memorize this — it governs every badge list) ---
  1. Lights  2. Doors  3. AC  4. Heat  5. Shades  6. Locks  7. Tanks  8. Energy  9. Misc
Navigation paths: /dashboard-librecoach/<lowercase-name>
Icons in order: mdi:light-recessed, mdi:door, mdi:air-conditioner, mdi:heat-wave,
  mdi:roller-shade, mdi:lock, mdi:water, mdi:transmission-tower, mdi:cog-outline

--- STEP 2: REQUIRED CONSTRAINTS ---
• ONLY use native HA cards: tile, gauge, entities, button, glance, grid,
  vertical-stack, horizontal-stack, history-graph, thermostat, sensor
• NEVER use any custom:* card. No exceptions.
• Every tile card MUST include hide_state: true (hide the entity state text)
• Dashboard must be optimized for MOBILE (compact, touch-friendly)
• ALL views use type: masonry — no sections views
• Navigation badges: every view gets the full set (minus current view) — see STEP 4.1
• Group entities by area using type: vertical-stack with title: <area name>
• If an entity has no area, infer one from its name/entity_id — never use "(no area)" as a title
• If FRIENDLY_NAME is blank or equals the entity_id, derive a readable name from the
  entity_id (drop the domain, replace underscores with spaces, Title-Case it) — never display a raw entity_id
• Goal: place ~95% of entities. If you can't confidently fit one on a specific view,
  put it in Misc — never silently drop an entity
• Dashboard path prefix: /dashboard-librecoach/
• Use the exact mdi: icons shown in the examples below — do not substitute

--- STEP 3: PRE-PROCESSING — DO THIS BEFORE WRITING ANY YAML ---
Scan the entire entity data at the bottom of this file and produce a mental checklist:
  a. Which of the 9 views will be created? (apply the rules in the view list below)
  b. Record the final list of active views — this is the ONLY set of badges you will
     place on every view. Do not add or remove badges mid-generation.

View detection rules (create a view only if matching entities exist):
  path: lights    title: Lights    icon: mdi:lightbulb       (domain: light, EXCLUDING door open/close lights — those go to Doors)
  path: doors     title: Doors     icon: mdi:door            (light entities whose FRIENDLY_NAME contains "door open" or "door close")
  path: ac        title: AC        icon: mdi:air-conditioner (climate with microair or ac in entity_id)
  path: heat      title: Heat      icon: mdi:heat-wave       (any OTHER climate — floor_heat_*, thermostat_zone_*, furnace_* — plus light aquahot_*)
  path: shades    title: Shades    icon: mdi:roller-shade    (domain: cover)
  path: locks     title: Locks     icon: mdi:lock            (domain: lock)
  path: tanks     title: Tanks     icon: mdi:water           (sensor with tank_ in entity_id, plus water_pump and autofill switches)
  path: energy    title: Energy    icon: mdi:transmission-tower (battery/power sensors and switches)
  path: misc      title: Misc      icon: mdi:cog-outline     (EVERYTHING not placed on another view — never drop an entity; see STEP 10)

--- STEP 4: EXACT CARD TEMPLATES (NATIVE CARDS ONLY) ---
Copy these patterns exactly, including icon values.

## Light (dimmable, DIMMABLE=true) — tile with brightness slider:
  type: tile
  entity: light.switch_4
  name: Entry Ceiling
  hide_state: true
  features_position: bottom
  features:
    - type: light-brightness

## Light (non-dimmable, DIMMABLE=false) — plain tile toggles on tap:
  type: tile
  entity: light.switch_g_1
  name: Entry Scene
  hide_state: true

## Night shade (cover) — inside horizontal-stack, left column:
  type: tile
  entity: cover.shade_7
  name: Windshield (Night)
  hide_state: true
  icon: mdi:moon-waning-crescent
  features_position: bottom
  features:
    - type: cover-open-close

## Day shade (cover) — inside horizontal-stack, right column:
  type: tile
  entity: cover.shade_2
  name: Windshield (Day)
  hide_state: true
  icon: mdi:white-balance-sunny
  features_position: bottom
  features:
    - type: cover-open-close

## Doors view — wrap EVERY door in ONE 2-column grid; each door is a vertical-stack:
  type: grid
  square: false
  columns: 2
  cards:
    - type: vertical-stack
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
    - type: vertical-stack
      title: Bath
      cards:
        - { type: button, name: Open, show_name: true, show_icon: false, show_state: false, entity: light.switch_28 }
        - { type: button, name: Close, show_name: true, show_icon: false, show_state: false, entity: light.switch_31 }

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
  hide_state: true
  features_position: bottom
  features:
    - type: climate-hvac-modes
    - type: target-temperature

## Floor heat zone (tile — use this exact features list, NOT thermostat):
  type: tile
  entity: climate.floor_heat_1
  name: Living Room
  hide_state: true
  vertical: false
  features_position: bottom
  features:
    - type: climate-hvac-modes
    - type: climate-preset-modes
      style: dropdown

## Aqua-Hot element (plain tile, toggles on tap):
  type: tile
  entity: light.aquahot_burner
  name: Diesel Burner
  hide_state: true

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

## Switch (water pump, autofill) — blue tint signals water system:
  type: tile
  entity: switch.water_pump
  name: Water Pump
  hide_state: true
  color: blue
  tap_action:
    action: toggle

## Battery gauge — STATE OF CHARGE (use when that battery sensor's UNIT is "%"):
## Use the actual battery SOC sensor from the entity data below — exact IDs vary
## by hardware (most coaches have no Victron gear); never assume this example ID.
  type: gauge
  entity: sensor.battery_house_state_of_charge
  name: House
  min: 0
  max: 100
  needle: true
  severity:
    green: 75
    yellow: 25
    red: 0

## Battery gauge — VOLTAGE (use when that battery sensor's UNIT is "V"; house or starter):
## Use the actual voltage sensor from the entity data below — exact IDs vary by
## hardware (most coaches have no Victron gear); never assume this example ID.
  type: gauge
  entity: sensor.battery_starter_voltage
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
• Dimmable lights (DIMMABLE=true) use the dimmable tile template above
• Non-dimmable lights (DIMMABLE=false) use the plain tile template
• Light groups (entity_id contains switch_g_) are always non-dimmable,
  place them at the end of their area grid

--- STEP 6: DOORS VIEW LAYOUT ---
type: masonry. Wrap ALL door locations in a single type: grid (square: false, columns: 2)
so each door occupies a half-width cell — never let a door card span the full view width.
Each door location is one type: vertical-stack with title: <location name> inside that grid,
holding the Open button then the Close button (show_name: true, show_icon: false, show_state: false).
Door entities are lights named "<place> door open" / "<place> door close"; pair them by place.

--- STEP 7: AC VIEW LAYOUT ---
type: masonry.
• One vertical-stack title: MicroAir Zones containing a type: grid (columns: 2, square: false)
  with all zone tile cards inside it — never place zone tiles loose in the stack
• One vertical-stack title: Temperature containing a glance card that lists every
  sensor with DEVICE_CLASS temperature (use name: type: area, or the friendly name
  when the sensor has no area)

--- STEP 8: HEAT VIEW LAYOUT ---
type: masonry.
• vertical-stack title: Aqua-Hot → type: grid (columns: 2, square: false) with aquahot_* tile cards
• vertical-stack title: Floor Heat → type: grid (columns: 2, square: false) with tile
  cards for each floor_heat zone inside it
• vertical-stack title: Zone Thermostats → type: grid (columns: 2, square: false) with
  tile cards for every thermostat_zone_* or furnace_* climate inside it
• vertical-stack title: Temperature → type: grid (columns: 2, square: false) with sensor cards
  (graph: none, detail: 1, name: type: area) for sensors with DEVICE_CLASS temperature

--- STEP 9: SHADES VIEW LAYOUT ---
type: masonry. Each area is a type: vertical-stack with title: <area name>.
The two-column night|day layout uses a single type: grid (columns: 2, square: false)
inside each vertical-stack — NOT individual horizontal-stacks per pair.
Using a grid guarantees every card is half-width, including lone unpaired shades.

Structure:
  1. If cover.all_night and cover.all_day exist — vertical-stack title: All:
       type: grid (columns: 2, square: false) with the night cover tile then the day cover tile
  2. For each area — vertical-stack title: <area>:
       type: grid (columns: 2, square: false) containing covers in this order:
         night cover tile first (icon: mdi:moon-waning-crescent),
         then its paired day cover tile (icon: mdi:white-balance-sunny).
       Repeat for each pair within the area. Unpaired covers go in the same grid as a
       single half-width card — never place any shade card outside a grid.
Pair shades by base FRIENDLY_NAME: the one containing "night" is the night cover, "day" the day cover.

--- STEP 9.1: LOCKS VIEW LAYOUT ---
type: masonry. All locks go in a single vertical-stack title: Locks, regardless of
their AREA value. Inside that stack: one type: grid (square: false, columns: 2)
containing every lock button card. Do NOT split locks by area — ignore AREA for locks.
The button's own name (show_name: true, show_icon: true) identifies each lock.

--- STEP 10: MISC VIEW LAYOUT ---
type: masonry.
• Use this exact YAML structure for the LibreCoach Tools card (include only entities
  present in the entity data; omit the entire entry if the entity is absent):

  type: vertical-stack
  cards:
    - type: entities
      title: LibreCoach Tools
      entities:
        - entity: button.librecoach_export_entities
          name:
            type: entity
        - entity: button.librecoach_export_entities_default
          name:
            type: entity
        - entity: text.rv_manufacturer
        - entity: text.rv_model
        - entity: text.rv_year
        - entity: text.rv_other
        - entity: button.librecoach_import_config
          name:
            type: entity
        - entity: button.librecoach_export_config
          name:
            type: entity
        - entity: switch.librecoach_record_unknown
          name:
            type: entity
        - entity: button.librecoach_export_unknown
          name:
            type: entity

• AFTER the Tools card, add a vertical-stack title: Other holding every entity not shown
  on any other view (e.g. generator_*, furnace_* status, geo_*, update): group related
  sensors/binary_sensors into type: entities cards, others as tile/button cards.
  This is the catch-all — do not silently drop entities.

--- STEP 11: TANKS VIEW LAYOUT ---
type: masonry. Use a single vertical-stack title: Water Management (or no title):
• Water pump and autofill tile switches FIRST — always include color: blue
• Then tank gauges: fresh water uses the fresh gauge template,
  black/grey tanks use the inverted gauge template
• Any other water-system switch (e.g. dump valves) also gets color: blue

--- STEP 12: ENERGY VIEW LAYOUT ---
type: masonry.
• vertical-stack title: Batteries → one gauge per battery sensor (pick the SOC gauge
  when its UNIT is "%", the Voltage gauge when its UNIT is "V"), then the power/inverter
  toggle button if one exists

--- STEP 13: ENTITY DATA FORMAT ---
The 7-column pipe-delimited data below lists LibreCoach entities (some may be unlabeled).
  AREA          — HA area; use for grouping. If AREA is "(no area)", infer a
                  logical room or category from the entity_id and friendly_name
                  (e.g. "Living Room", "Bedroom", "Exterior") — never display
                  a header labeled "(no area)"
  DOMAIN        — entity type (light, cover, lock, climate, sensor, switch, button)
  ENTITY_ID     — use exactly as-is in the entity: field
  FRIENDLY_NAME — use as the name: field on the card. If blank or identical to ENTITY_ID,
                  derive a short human name from the entity_id (drop domain, de-underscore,
                  Title-Case) — never show a raw entity_id as a card name
  DEVICE_CLASS  — HA device class hint
  UNIT          — unit_of_measurement (e.g. %, V, °F); use to pick gauge ranges
  DIMMABLE      — true/false; drives whether a light tile gets the light-brightness feature

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

Use the closest matching card template for each entity. If an entity truly has no
sensible card, place it in the Misc → Other catch-all rather than discarding it.
Remember: NO custom:* cards anywhere in the output.

`;

// Select the standard-cards-only variant when the default-trigger topic fired.
const isDefault = (msg.topic || "").includes("/entities/default/");
const variant = isDefault
  ? {
    header: DEFAULT_PROMPT_HEADER,
    filename: "librecoach_dashboard_prompt_default.txt",
    downloadPage: "librecoach_download_dashboard_default.html",
    notificationId: "librecoach_export_entities_default",
    title: "LibreCoach Dashboard Prompt (Standard Cards)",
  }
  : {
    header: PROMPT_HEADER,
    filename: "librecoach_dashboard_prompt.txt",
    downloadPage: "librecoach_download_dashboard.html",
    notificationId: "librecoach_export_entities",
    title: "LibreCoach AI Dashboard Prompt (Mushroom Cards)",
  };

const fullContent = variant.header + content;
const lineCount = content
  .split("\n")
  .filter((l) => l.trim() && !l.startsWith("AREA")).length;

const common = {
  entityCount: lineCount,
  exportFilename: variant.filename,
  downloadPage: variant.downloadPage,
  notificationId: variant.notificationId,
  notifyTitle: variant.title,
};

const textMsg = {
  filename: `/homeassistant/www/${variant.filename}`,
  payload: fullContent,
  ...common,
};

const htmlMsg = {
  filename: `/homeassistant/www/${variant.downloadPage}`,
  payload: `<!DOCTYPE html>
<html><head><title>${variant.title}</title></head>
<body>
<script>
var a = document.createElement("a");
a.href = "/local/${variant.filename}";
a.download = "${variant.filename}";
document.body.appendChild(a);
a.click();
setTimeout(function() { window.close(); }, 1000);
</script>
<p>Your download should start automatically. If not, <a href="/local/${variant.filename}" download="${variant.filename}">click here</a>.</p>
</body></html>`,
  ...common,
};

node.status({
  fill: "green",
  shape: "dot",
  text: `${lineCount} entities${isDefault ? " (standard)" : ""}`,
});
return [[textMsg, htmlMsg]];
