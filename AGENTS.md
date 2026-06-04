# librecoach-node-red

Workspace rules: `../../../AGENTS.md`


## Wiring map — start here for topology

`src/_wiring_index.md` — global index of all tabs, subflows, config nodes, and cross-tab link pairs.

Each tab and subflow has its own `_wiring.md` co-located in `src/tabs/<tab>/` and `src/subflows/<subflow>/`. These files list every node, its message contract, upstream/downstream wiring, and config-node dependencies.

To regenerate after flow changes:

```bash
node ~/src/librecoach/librecoach-flow-tools/tools/wiring-map/generate.js --project librecoach --config ~/src/librecoach/librecoach-flow-tools/librecoach-flow-tools.config.json
```

The pre-commit hook regenerates stale wiring maps automatically on every commit.

## REQUIRED: Regenerate wiring maps before any work

**You must run the wiring map generator as the first step of every session — before reading any flow files, before investigating any issue, before making any changes.** The wiring maps in `src/wiring/` and `src/_wiring_index.md` may not reflect the current canvas state, and working from stale maps leads to incorrect conclusions.

```bash
node ~/src/librecoach/librecoach-flow-tools/tools/wiring-map/generate.js --project librecoach --config ~/src/librecoach/librecoach-flow-tools/librecoach-flow-tools.config.json
```

After running, review the output for warnings (orphaned nodes, broken links, missing companion `.js` files) before proceeding. Do not skip this step even for small or apparently simple tasks.

## RV-C spec reference

The RV-C specification is available at `~/src/librecoach/librecoach-rvc/`. Device definitions are in `devices/06_*.md`. Always reference the spec for standard DGN layouts, byte maps, and enumeration values.

**Important**: AquaHot and other proprietary devices often deviate from the spec. Proprietary notes (reverse-engineered from bus recordings) are in `notes/`. Do not assume a standard DGN byte map applies to proprietary devices without cross-checking the notes.

Key paths:
- Standard DGN definitions: `~/src/librecoach/librecoach-rvc/devices/`
- Proprietary device notes: `~/src/librecoach/librecoach-rvc/notes/`
- AquaHot protocol notes: `~/src/librecoach/librecoach-rvc/notes/aquahot.md`

## Flow-splitter behavior

The project uses `@vdwpsmt/node-red-contrib-flow-splitter-extended` with
`restoreFunctionsTemplates: true` in `.config.flow-splitter.json`.

This means the splitter **fully restores the Node-RED canvas from `src/`** — new nodes,
updated function code, and wiring all apply on next deploy. You can freely add new node
definitions to `src/tabs/*.yaml` and companion `.js` files; they will be created in
Node-RED when the user deploys.