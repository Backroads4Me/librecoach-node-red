# librecoach-node-red (test sandbox)

## Wiring map — start here for topology

`src/_wiring_index.md` — global index of all tabs, subflows, config nodes, and cross-tab link pairs.

Each tab and subflow has its own `_wiring.md` co-located in `src/tabs/<tab>/` and `src/subflows/<subflow>/`. These files list every node, its message contract, upstream/downstream wiring, and config-node dependencies.

To regenerate after flow changes:

```bash
node /home/ted/github/librecoach/librecoach-flow-tools/tools/wiring-map/generate.js --project librecoach-test
```

The pre-commit hook regenerates stale wiring maps automatically on every commit.
