---
name: homeassistant-onecli-ashub
description: >-
  Home Assistant on OneCLI: api_key app connection (token + serverUrl), per-connection
  identity via URL hostname (metadata.name / metadata.haHost), container-config env
  (HASS_SERVER, HASS_TOKEN), and gateway Bearer injection only when request Host
  exactly matches metadata.haHost (no generic .ts.net or TLD-wide rules). Use when
  implementing or debugging Home Assistant integration, multi-connection behavior,
  container env, or gateway injection matching.
disable-model-invocation: true
---

# Home Assistant on OneCLI

Use this skill when implementing or debugging **Home Assistant as an app connection** (provider id `home-assistant`), **agent container env**, or **gateway auth injection** for per-instance hosts.

## App definition checklist

- [`packages/api/src/apps/home-assistant.ts`](packages/api/src/apps/home-assistant.ts) — `AppDefinition`:
  - `connectionMethod.type: "api_key"`
  - **Field order matters** (connect stores first field as `access_token`):
    - Field 1: `token` (long-lived access token) → persisted as `access_token`
    - Field 2: `serverUrl` (full base URL including scheme)
  - `resolveMetadata` derives `metadata.name` / `metadata.haHost` from `serverUrl`
  - Icon at [`apps/web/public/icons/home-assistant.svg`](apps/web/public/icons/home-assistant.svg)
- [`packages/api/src/apps/registry.ts`](packages/api/src/apps/registry.ts) — register `homeAssistant`.

## Connection identity + multi-connection behavior

Goal: multiple HA instances for the same provider, keyed by **exact hostname**.

- [`packages/api/src/apps/connect-credentials.ts`](packages/api/src/apps/connect-credentials.ts) + connect handler in [`packages/api/src/routes/apps.ts`](packages/api/src/routes/apps.ts):
  - `resolveMetadata` on the HA app parses `serverUrl` and sets:
    - `metadata.name`: hostname (for UI label via `extractLabel`)
    - `metadata.haHost`: normalized hostname (lowercase, no trailing dot) used by the gateway
  - This prevents the default `api_key` connect behavior from overwriting `existing[0]` when `metadata` is missing.
- Helper lives in [`packages/api/src/lib/home-assistant-url.ts`](packages/api/src/lib/home-assistant-url.ts).

## Container env contract

[`packages/api/src/routes/container-config.ts`](packages/api/src/routes/container-config.ts) augments the returned `env` with Home Assistant variables when an applicable connected HA `AppConnection` exists:

- `HASS_SERVER`: from stored `serverUrl` (normalized for trailing slash)
- `HASS_TOKEN`: from stored `access_token`

**Eligibility:** only connections the agent can inject (policy/grants). If several eligible HA connections exist, newest by `updatedAt` wins.

## Gateway: exact-host injection (no generic suffix)

Goal: inject `Authorization: Bearer <token>` only for the exact HA host stored in the connection.

- [`apps/gateway/src/connect.rs`](apps/gateway/src/connect.rs):
  - `resolve_app_connections`: union in `home-assistant` connections where `metadata.haHost` exactly equals the normalized request `Host` (full FQDN per connection). This bypasses `apps::providers_for_host(hostname)` for HA so random per-instance hosts work.
  - `resolve_connection_injections`: for provider `home-assistant`, build a single wildcard `InjectionRule` that sets `authorization` to `Bearer {token}` (without requiring a matching `HostRule` in [`apps/gateway/src/apps.rs`](apps/gateway/src/apps.rs)).
  - `has_project_credentials`: treat HA connections as present for the host when `haHost` matches (helps selective-mode “access restricted” errors).

## Verification

- `pnpm check` (or at least `pnpm -C packages/api exec tsc --noEmit`)
- `cargo test -p onecli-gateway` (or `cd apps/gateway && cargo test`)
- Create two HA connections:
  - `https://asmarthub10.tail2b4838.ts.net` and `https://asmarthub11.tail2b4838.ts.net`
  - Ensure two `app_connections` rows exist (distinct `metadata.haHost`)
  - Requests proxied to each host receive the matching token, never the other
