# LibreCoach Node-RED Planned Review Work

This is the active handoff queue for `/home/ted/src/librecoach/librecoach-node-red`.

Review report baseline: tree as of June 9, 2026. Developers must verify file paths against current code before editing. Before editing flow files, follow this repo's `AGENTS.md`: regenerate wiring maps first and review warnings.

## Priority Order

1. C-6: publish Node-RED readiness so ha-addons startup can wait for actual flow readiness.
2. N-1: add Home Assistant MQTT availability topics.
3. B-3/BL-3, B-6, F-6: BLE/Micro-Air HA controls and diagnostics.
4. F-4: dashboard metadata if the dashboard branch needs Node-RED discovery attributes.

## C-6: Node-RED Readiness Race

Status: Completed in this branch.

Owner repo: `librecoach-node-red`.

Goal: publish an explicit readiness signal only after LibreCoach flows are loaded and critical MQTT subscriptions are registered.

Why this matters:

- ha-addons can see Node-RED's HTTP port before LibreCoach flows are subscribed to MQTT.
- Startup code may publish one-shot or non-retained setup/config messages during that window.
- If Node-RED is not subscribed yet, those messages can be missed even though the API looked ready.
- C-6 fixes this by making flow readiness an explicit retained MQTT contract.

Scope:

- Node-RED startup/config flow.
- Generated `artifact/flows.json` and any tab YAML/function sidecar files required by the flow-splitter workflow.

Implementation direction:

- Publish retained topic `librecoach/nodered/ready`.
- Publish only after LibreCoach flows have loaded and critical MQTT subscriptions are registered.
- Republish on Node-RED restart.
- Keep payload simple and machine-readable, for example JSON with `ready`, `version`, and `updated_at`.
- Coordinate topic/payload with ha-addons `run.sh` wait logic in branch `fix/c1-c8-startup-hardening`.

Acceptance tests:

- Cold boot publishes readiness only after flow subscriptions are active.
- Restart republishes readiness.
- ha-addons C-6 can wait on the retained topic without racing startup messages.

## N-1: Missing Availability Topics

Status: Completed in branch.

Implementation notes (per-source availability, all LibreCoach-owned topics):

- CAN/RV-C entities (status-routing/*, aquahot/*, command-routing/*, floor heat) use an `availability` list with `availability_mode: "all"`:
  - `librecoach/nodered/status` (`online`/`offline`, Node-RED LWT) — covers add-on stop.
  - `can/status` from `vehicle_bridge/can_bridge.py` via `value_template` mapping `online`→available and `offline`/`no_interface`→unavailable. (Note: the unrelated `can-mqtt-bridge` add-on is out of scope; its `bridge_online`/`bridge_offline` payloads are NOT used.)
- Victron entities use `nodered/status` + derived `librecoach/victron/status`. Venus OS has no native status topic, so `victron_decode_mqtt` stamps `victronLastSeen` on inbound `N/+/#` data and `victron_keep_alive` (30s "Repeat" inject) publishes retained `online`/`offline` on change (90s staleness) via the "MQTT out: Retain TRUE" link.
- BLE/Micro-Air entities use the existing per-device `librecoach/ble/microair/<mac>/available`.

Owner repo: `librecoach-node-red`.

Goal: prevent stale Home Assistant entities from appearing healthy.

Scope:

- `src/tabs/status-routing/status_*.js`
- `src/tabs/victron/victron_create.js`
- `src/tabs/config/create_user_toggles.js`
- BLE/Micro-Air discovery functions as applicable.
- Generated `artifact/flows.json` and tab/function sidecars.

Implementation direction:

- Inventory all MQTT Discovery configs LibreCoach publishes.
- Add appropriate `availability_topic` entries for RV-C, Victron, BLE, and user-toggle entities.
- Use precise status topics where available: bridge/CAN status for CAN-derived entities, BLE availability for BLE entities, Victron status for Victron entities.
- If needed, publish simple derived status topics from Node-RED instead of depending on deferred V-5 JSON status.
- Publish retained availability messages on startup and shutdown/LWT where possible.
- Document topic ownership and expected payloads.

Acceptance tests:

- Add-on stop marks entities unavailable.
- Missing CAN interface marks CAN-derived entities unavailable/degraded if a usable CAN status topic exists.
- BLE offline marks BLE climate entities unavailable.
- Victron disconnected marks Victron entities unavailable.

## B-3 / BL-3: BLE Reset Tool

Status: Completed in branch.

Owner repo: `librecoach-node-red`.

Goal: expose the BLE lock reset as a simple action in the LibreCoach Tools section.

Decision:

- Add a single LibreCoach Tools action.
- Do not build a per-device picker for the first implementation.
- Do not make this an add-on config setting.

Implementation direction:

- Create a Home Assistant button named "Forget BLE Devices" or "Reset Bluetooth Pairing".
- Place it with the other LibreCoach Tools controls, not in a per-device card.
- Button publishes `librecoach/ble/reset_locks`.
- Button help/description should state that it clears saved BLE device locks only and keeps add-on settings/passwords.
- After click, status should show waiting/scanning until devices are rediscovered.

Acceptance tests:

- Tools button publishes the expected reset-locks command topic.
- Button is visible in LibreCoach Tools.
- Clicking it does not change Micro-Air password or BLE enabled settings.
- UI status clearly returns to waiting/scanning until relock.

## B-6: Micro-Air Dry Fan Mode Mapping

Status: Completed in this branch.

Owner repo: `librecoach-node-red`.

Decision: do not expose Micro-Air dry mode through Home Assistant for now. Do not advertise `dry` in Micro-Air climate discovery `modes`, and do not create dry-mode fan state or optimistic dry-mode fan updates.

Scope:

- `src/tabs/micro-air/microair_create_climate.js`
- `src/tabs/micro-air/microair_decode_status.js`
- `src/tabs/micro-air/microair_optimistic_update.js`
- `src/tabs/micro-air.yaml`
- Generated `artifact/flows.json`

Implementation direction:

- Remove/suppress `dry` from Micro-Air climate discovery modes.
- Do not publish HA dry-mode fan state or accept dry-mode fan commands.
- Remove optimistic dry-mode fan updates; dry-related raw payload fields may remain only as diagnostics/debug data.
- Regenerate flow artifacts using the repo's established flow-splitter workflow.
- Do not edit `flows.json` directly except as generated artifact output committed with source tab/function changes.

Acceptance tests:

- Micro-Air climate discovery does not advertise `dry`.
- HA cannot send Micro-Air dry-mode commands.
- Switching into or out of other modes does not publish misleading dry fan optimistic state.
- Auto mode still uses `auto_fan_mode_num`.
- Cool mode still uses `cool_fan_mode_num`.
- Any retained raw/debug state that includes duplicated dry fan data is documented as protocol/debug data, not HA control state.

## F-4: Lovelace Strategy Dashboard Metadata

Status: Deferred. The only change made (adding `suggested_area` to device blocks) was rolled back on this branch — it did not provide the section/label metadata a dashboard strategy needs, and the effort was judged not worthwhile for now. Revisit if/when the dashboard branch actually requires Node-RED discovery attributes.

Owner repo: `librecoach-node-red` for entity metadata/discovery attributes only.

Goal: provide stable entity metadata so a generated dashboard can adapt to detected LibreCoach devices without hardcoded entity IDs.

Scope:

- MQTT Discovery payloads and device metadata emitted by Node-RED.
- Labels/categories/entity metadata needed by the dashboard strategy.
- Generated `artifact/flows.json` and tab/function sidecars.

Implementation direction:

- Add labels/device metadata/naming conventions that let the dashboard find health, tanks, climate, power, slides/awnings/loads, location, and diagnostics.
- Do not hardcode entity IDs for dashboard discovery.
- Preserve compatibility with existing entity unique IDs.

Acceptance tests:

- Dashboard can discover sections from metadata.
- Dashboard works with only CAN entities.
- Dashboard works when BLE/Victron are enabled.
- Missing hardware does not leave broken cards.

## F-6: BLE Offline Alerts And Recovery Controls

Status: Completed in branch.

Implementation notes (Node-RED side surfaces the ha-addons BLE contract):

- Per-device diagnostic entities created in `microair_create_climate.js`, reading the dedicated retained topics published by the ha-addons BLE bridge: `/available` (binary_sensor), `/last_success` (sensor, `device_class: timestamp`), `/failure_count` (sensor, `state_class: measurement`), `/last_error` (sensor; `none` | `auth_failed` | `connectivity`, giving the auth-vs-connectivity distinction).
- Per-device recovery buttons publishing the bridge's command topics: `BLE Reconnect` → `/reconnect`, `BLE Clear Errors` → `/clear_errors`. Button availability is tied to `librecoach/nodered/status` (not the device's `/available`) so they remain usable while the device is offline.
- Reset-locks button (B-3) publishes the global `librecoach/ble/reset_locks`.
- Backoff/retry and offline-after-N-failures logic live in ha-addons (`librecoach_ble`); Node-RED only publishes discovery.

Owner repo: `librecoach-node-red`.

Goal: expose BLE outage state and recovery controls in Home Assistant.

Scope:

- BLE diagnostic discovery.
- Button discovery for reconnect, reset BLE locks, and clear failure state.
- Generated `artifact/flows.json` and tab/function sidecars.

Implementation direction:

- Create diagnostic entities for per-device availability, last_success, failure_count, and last_error.
- Create buttons that publish the ha-addons BLE command topics.
- Use B-3/BL-3 for the reset-locks button.
- Distinguish auth failure from offline/range/power failures in entity state or attributes.

Acceptance tests:

- BLE offline appears in HA.
- Manual reconnect schedules immediate retry.
- Reset BLE locks button clears persisted device locks.
- Auth failure message is distinct from connectivity failure.
