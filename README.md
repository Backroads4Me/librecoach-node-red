# LibreCoach Node-RED Flows

Node-RED flows for LibreCoach, an RV-C to Home Assistant control and monitoring system.

This repository contains the flow-based logic that decodes RV-C CAN messages, publishes Home Assistant entities through MQTT, and sends supported control commands back to the RV network.

For user-facing documentation, visit [LibreCoach.com](https://librecoach.com).

## Diagnostic entity map

LibreCoach publishes one complete retained snapshot on `rvc/entity-map`.
The version 1 payload joins each stable MQTT discovery `unique_id` to Home
Assistant's current entity ID and effective friendly name. Each entity carries
its original LibreCoach object identity, component, name source, and explicit
RV-C bindings with decoder, selector, required-signal, projection, role, and
provenance metadata.

The Config flow rebuilds the snapshot after deploy, Home Assistant readiness,
entity-registry updates, and discovery creation or removal. It uses the existing
Home Assistant WebSocket connection for the entity registry and the existing
Supervisor token for `/api/states`. The snapshot contains no credentials or CAN
addresses. Command bindings are descriptive metadata only.

## Related Repositories

- [`ha-addons`](https://github.com/Backroads4Me/ha-addons) packages LibreCoach as a Home Assistant add-on.
- [`librecoach-site`](https://github.com/Backroads4Me/librecoach-site) contains the public documentation site.

## License

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0-only)**.
Contributions are accepted under the CLA, which grants the project owner the right to offer
alternative licensing terms (including commercial licensing) outside this repository.

---

## Contributing

Contributions require signing the CLA. See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Support LibreCoach

LibreCoach is free and open source.

If it helped you connect your RV to Home Assistant, the best way to support the project right now is to star this repository so other RV and Home Assistant users can find it.

[![Star Repository](https://img.shields.io/badge/%E2%AD%90%20Star%20this%20Repo-GitHub-lightgrey?logo=github&logoColor=black)](https://github.com/Backroads4Me/librecoach-node-red)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-GitHub-EA4AAA?logo=github-sponsors&logoColor=white)](https://github.com/sponsors/Backroads4Me)
