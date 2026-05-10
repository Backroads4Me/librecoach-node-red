# Peer Review — LibreCoach Node-RED Session (2026-05-10)

Two features were implemented tonight. Please review correctness, logic, and potential edge cases.

---

## Feature 1 — RV-C Network Time Sync

### What it does
Broadcasts the Pi's system time to the RV-C CAN bus every 60 seconds using `SET_DATE_TIME_COMMAND` (DGN `0x1FFFE`, §6.25.1 of the RV-C spec). Disabled by default. Controlled via the LibreCoach HA addon config UI like all other feature flags.

### Files changed

#### `ha-addons/librecoach/config.yaml`
- Added `rvc_time_sync_enabled: false` to `options:`
- Added `rvc_time_sync_enabled: bool` to `schema:`

#### `ha-addons/librecoach/translations/en.yaml`
- Added label/description for the new toggle

#### `ha-addons/librecoach/run.sh`
- Added `RVC_TIME_SYNC_ENABLED=$(bashio::config 'rvc_time_sync_enabled')`
- Added `mqtt_pub -t "librecoach/config/rvc_time_sync_enabled" -m "$RVC_TIME_SYNC_ENABLED"` in both the initial publish block and the re-publish block

#### `src/tabs/config/store_config_globals.js`
```js
if (key === "rvc_time_sync_enabled") global.set("timeSyncEnabled", val, "file");
```
Note: uses `"file"` persistence store (survives Node-RED restart) — intentional, matches other long-lived flags.

#### `src/tabs/config/rvc_time_sync.js` (new file)
Core logic. Please review carefully:

```js
// Broadcasts SET_DATE_TIME_COMMAND to the RV-C network (DGN 1FFFEh, §6.25.1)
// Fires every 60s via inject node. Gated by timeSyncEnabled global (default: false).

// --- Configuration ---
const PRIORITY = 6;
const DGN = 0x1FFFE;
const SOURCE_ADDRESS = global.get("rvc_source_address") || 254;

// --- Feature Gate ---
const timeSyncEnabled = global.get("timeSyncEnabled");
if (!timeSyncEnabled) return null;

// --- Current Time ---
const dt = new Date();

// --- Helpers ---
// RV-C DOW: 1=Sunday..7=Saturday (JS getDay(): 0=Sun..6=Sat)
const rvcDow = (jsDow) => (jsDow === 0 ? 1 : jsDow + 1);
// Derive TZ code from system UTC offset: std offset in hours, minus 1 if DST active
const jan = new Date(dt.getFullYear(), 0, 1).getTimezoneOffset();
const jul = new Date(dt.getFullYear(), 6, 1).getTimezoneOffset();
const std = Math.max(jan, jul);
const isDst = dt.getTimezoneOffset() < std;
const tzCode = isDst ? std / 60 - 1 : std / 60;

// --- Payload ---
const dataBytes = [
  Math.max(0, Math.min(255, dt.getFullYear() - 2000)), // Byte 0: Year (2000..2255)
  dt.getMonth() + 1,                                   // Byte 1: Month (1..12)
  dt.getDate(),                                         // Byte 2: Day (1..31)
  rvcDow(dt.getDay()),                                  // Byte 3: Day of week (1..7)
  dt.getHours(),                                        // Byte 4: Hour (0..23)
  dt.getMinutes(),                                      // Byte 5: Minute (0..59)
  dt.getSeconds(),                                      // Byte 6: Second (0..59)
  tzCode & 0xff,                                        // Byte 7: Timezone code
];

// --- Build and Send ---
const dataHex = dataBytes.map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
const canIdInt = (PRIORITY << 26) | (DGN << 8) | SOURCE_ADDRESS;
const canIdHex = canIdInt.toString(16).padStart(8, "0").toUpperCase();
node.status({ fill: "green", shape: "dot", text: `...` });
return { topic: "can/send", payload: `${canIdHex}#${dataHex}` };
```

**Things to verify:**
- CAN ID calculation: `(6 << 26) | (0x1FFFE << 8) | 254` — confirm priority 6 is correct for time broadcast per spec
- Byte layout matches §6.25.1 exactly (8 bytes, order: year, month, day, dow, hour, min, sec, tz)
- Day-of-week mapping: RV-C is 1=Sun..7=Sat, JS is 0=Sun..6=Sat — is `jsDow === 0 ? 1 : jsDow + 1` correct?
- Timezone code derivation: derives standard UTC offset in hours; subtracts 1 if DST is active — is this what RV-C expects?
- SOURCE_ADDRESS fallback to 254 — is 254 (0xFE = unclaimed/null address) appropriate here?
- The message routes via MQTT topic `can/send` → can-mqtt-bridge addon → `cansend` on the CAN interface (this is the correct path, not raw socketcan)

#### `src/tabs/config.yaml`
- Three new nodes appended at bottom of the Config tab (y: 1820, z: `292e70a6ba25b323`):
  - Inject node: fires every 60s, once after 10s delay on startup
  - Function node: `rvc_time_sync` (inline copy of the JS above)
  - Link-out node: connects to the existing `can/send` link-in node (`74329f13cbbc528a`)
- The link-in node `74329f13cbbc528a` had `de36b6c52fd2b2cc` added to its `links` array to accept the new connection

---

## Feature 2 — Export AI Dashboard Prompt

### What it does
Repurposes the old "Export Entity List" button into "Export AI Dashboard Prompt". When pressed in HA, it queries all entity states via the HA Jinja2 template API, builds a structured text file, and prepends a detailed LLM prompt. The user downloads the file and pastes it into Claude, GPT-4o, etc. to generate a complete mobile-optimized LibreCoach dashboard YAML in one shot.

### Files changed

#### `src/tabs/config/create_user_toggles.js` (and synced in `config.yaml`)
```js
// Before:
name: "Export Entity List",
icon: "mdi:format-list-bulleted",

// After:
name: "Export AI Dashboard Prompt",
icon: "mdi:robot-outline",
```
`unique_id` and `command_topic` are unchanged — existing HA entity is updated in place.

#### `src/tabs/templates/export_entities_prepare.js` (and synced in `templates.yaml`)
Two additions to the Jinja2 template string:

**Filter unlabeled entities** — inserted after `fname` is set:
```jinja2
{%- if fname.startswith('LibreCoach:') -%}{%- continue -%}{%- endif -%}
```
LibreCoach default entity names have a "LibreCoach: " prefix. This skips any entity the user hasn't renamed, keeping the export clean.

**DIMMABLE column** — detects dimming capability via the `brightness` attribute:
```jinja2
{%- set dimmable = 'true' if 'brightness' in s.attributes else 'false' -%}
{%- set ns.rows = ns.rows + [area ~ '|' ~ domain ~ '|' ~ eid ~ '|' ~ fname ~ '|' ~ sv ~ '|' ~ dc ~ '|' ~ dimmable] -%}
```

Header row updated: `AREA|DOMAIN|ENTITY_ID|FRIENDLY_NAME|STATE|DEVICE_CLASS|DIMMABLE`

**Things to verify:**
- `'brightness' in s.attributes` — is this reliable for all HA light platforms that support dimming? Any known false positives or negatives?
- `fname.startswith('LibreCoach:')` — does this catch all the default unlabeled entity names without accidentally filtering user-renamed ones?

#### `src/tabs/templates/export_entities_publish.js` (and synced in `templates.yaml`)
- Output filename: `librecoach_entities.txt` → `librecoach_dashboard_prompt.txt`
- HTML redirect page: `librecoach_download_entities.html` → `librecoach_download_dashboard.html`
- Prepends `PROMPT_HEADER` constant before the entity data rows

The `PROMPT_HEADER` contains:
1. Web search directive (LLM must search for current mushroom + HA sections syntax before writing YAML)
2. Hard constraints (card types allowed, mobile-first, navigation badges on every view, masonry for lights)
3. Exact list of 7 views to create with paths and icons
4. Copy-paste YAML card templates for every card type:
   - Dimmable light (`show_brightness_control: true`, `collapsible_controls: false`)
   - Non-dimmable light
   - Night shade (`mdi:moon-waning-crescent`)
   - Day shade (`mdi:white-balance-sunny`)
   - Lock (native button card with `tap_action: toggle`)
   - MicroAir AC tile (exact `features:` list: `climate-hvac-modes` + `target-temperature`, `grid_options: columns: 6, rows: 3`)
   - Floor heat thermostat (`climate-hvac-modes` + `climate-preset-modes style: dropdown`)
   - Aqua-Hot element (mushroom-light, no brightness)
   - Fresh water tank gauge (severity: green ≥60, yellow ≥40, red ≥0)
   - Black/grey tank gauge (inverted severity: red ≥60)
   - Switch entity card (water pump, autofill pattern)
   - Complete navigation badge block (all 7 views, using `zone.home` as badge entity)
5. Lights view layout rules (masonry, grid columns:2, groups at end)
6. Shades view layout rules (sections, horizontal-stack night/day columns)
7. Entity data format explanation
8. RV-specific entity naming notes

**Things to verify:**
- The MicroAir `climate-hvac-modes` and `target-temperature` feature type strings — are these the current HA tile feature type names? (The prompt instructs the LLM to web search and confirm, but worth checking our examples are current as of HA 2024.x)
- `zone.home` as the badge entity — does this exist on all HA installs including fresh ones?
- The prompt instructs `type: masonry` for lights and `type: sections (max_columns: 4)` for all others — is this consistent with what the reference dashboard uses?

#### `src/tabs/templates/export_entities_notify.js` (and synced in `templates.yaml`)
```js
// Before:
const filename = msg.exportFilename || "librecoach_entities.txt";
const downloadUrl = `${haBaseUrl}/local/librecoach_download_entities.html`;
title: "LibreCoach Entity List Ready",

// After:
const filename = msg.exportFilename || "librecoach_dashboard_prompt.txt";
const downloadUrl = `${haBaseUrl}/local/librecoach_download_dashboard.html`;
title: "LibreCoach AI Dashboard Prompt Ready",
```

---

## Architecture Notes

- All JS files under `src/tabs/<tab>/` are the source of truth for function node content. The YAML files (`src/tabs/*.yaml`) contain inline `func:` copies that must be kept in sync — the `@vdwpsmt/node-red-contrib-flow-splitter-extended` tool with `restoreFunctionsTemplates: true` uses the JS files when restoring, but the YAML is what gets deployed. Both were updated in all cases above.
- The existing entity filter in `export_ha_config.js` uses a JavaScript string check; this export uses the Jinja2 equivalent (`fname.startswith('LibreCoach:')`). Both should exclude the same set of entities.

---

## How to Test

### Time Sync
1. Enable "Enable RV-C Network Time Sync" in the LibreCoach addon config
2. Wait up to 10 seconds for initial broadcast (inject node has 10s startup delay)
3. Monitor MQTT topic `can/send` — expect a message like `180FFFE FE#YYMMDDDDHHMMSStz` every 60s
4. Decode hex payload and verify date/time matches system clock
5. Disable the toggle, confirm broadcasts stop

### Export AI Dashboard Prompt
1. In HA, press the "Export AI Dashboard Prompt" button (LibreCoach: System device)
2. A persistent notification should appear: "LibreCoach AI Dashboard Prompt Ready"
3. Click the download link — `librecoach_dashboard_prompt.txt` should download
4. Verify the file opens with the `====` instruction block
5. Verify no rows where FRIENDLY_NAME starts with "LibreCoach:"
6. Verify DIMMABLE column is present and `true` for known dimmable lights, `false` for groups/scenes
7. Paste into Claude or GPT-4o — confirm the LLM performs web searches before generating YAML
