# Community Subgroups

Create community subgroups and manage titles, descriptions and pinned messages through authorized commands and durable host flows.

Standalone WABS package `official.community-subgroups` version `0.1.1`, requiring WABP core API `^0.3.0`. Existing plugin IDs, enabled state, participant limits, subgroup creation policies and saved draft keys remain unchanged. WABP owns flow sessions, scoped storage, authoritative creator identity, lifecycle transactions and transport authorization.

The package includes the SDK, Zod and Portuguese translations. The pinned event subgroup-ownership service contract is included without its provider implementation. `contracts/provenance.json` records its source commit and checksum; packaging rejects changes to those upstream bytes.

Install through a trusted WABS registry entry. Installation and scope enablement are separate operations. The publisher signs exact archive bytes; registry branding alone does not establish trust.

For development, run `npm ci --ignore-scripts`, `npm test`, then `npm run release:archive`. Tests use synthetic identifiers, in-memory drafts and mocked host capabilities. CI checks Node22.23.2 and24.15.0, reproducible archives and execution outside the repository.

`provenance.json` records imported source history and the exact SDK archive. Runtime dependencies and their licenses are included; no host implementation or credentials are included.
