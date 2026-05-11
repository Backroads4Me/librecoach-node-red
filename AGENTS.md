# librecoach-node-red

Workspace rules: `/home/ted/src/AGENTS.md`

RV-C protocol reference: `/home/ted/src/local/knowledge/projects/librecoach/wiki/index.md`

## Wiring map — start here for topology

`src/_wiring_index.md` — global index of all tabs, subflows, config nodes, and cross-tab link pairs.

Each tab and subflow has its own `_wiring.md` co-located in `src/tabs/<tab>/` and `src/subflows/<subflow>/`. These files list every node, its message contract, upstream/downstream wiring, and config-node dependencies.

To regenerate after flow changes:

```bash
node /home/ted/src/librecoach/librecoach-flow-tools/tools/wiring-map/generate.js --project librecoach --config /home/ted/src/librecoach/librecoach-flow-tools/librecoach-flow-tools.config.json
```

The pre-commit hook regenerates stale wiring maps automatically on every commit.

## Flow-splitter behavior

The project uses `@vdwpsmt/node-red-contrib-flow-splitter-extended` with
`restoreFunctionsTemplates: true` in `.config.flow-splitter.json`.

This means the splitter **fully restores the Node-RED canvas from `src/`** — new nodes,
updated function code, and wiring all apply on next deploy. You can freely add new node
definitions to `src/tabs/*.yaml` and companion `.js` files; they will be created in
Node-RED when the user deploys.