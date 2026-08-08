---
name: airtable-onecli-ashub
description: >-
  Airtable on OneCLI: OAuth app id `airtable` (PKCE + server-side token exchange,
  HttpOnly PKCE cookie), BYOC env AIRTABLE_CLIENT_ID / AIRTABLE_CLIENT_SECRET,
  gateway Bearer injection on api.airtable.com and Basic-auth refresh with
  rotating refresh_token persistence. Use when implementing or debugging the
  Airtable connection, OAuth, gateway refresh, or API calls through the proxy.
disable-model-invocation: true
---

# Airtable on OneCLI

Use this skill when working on the **Airtable app connection** (provider `airtable`), **OAuth PKCE**, or **gateway auth** for `api.airtable.com`.

## Quick checklist

- [`packages/api/src/apps/airtable.ts`](packages/api/src/apps/airtable.ts) — `AppDefinition`, `requiresPkce: true`, Basic auth on token exchange
- [`packages/api/src/apps/registry.ts`](packages/api/src/apps/registry.ts) — register `airtable`
- [`packages/api/src/apps/types.ts`](packages/api/src/apps/types.ts) — optional `requiresPkce`, `OAuthBuildAuthUrlParams` / `OAuthExchangeCodeParams` PKCE fields
- [`packages/api/src/routes/apps.ts`](packages/api/src/routes/apps.ts) — authorize: PKCE cookie + challenge when `requiresPkce`; callback: read verifier from cookie, clear cookie, pass `codeVerifier` to `exchangeCode`
- [`packages/api/src/lib/oauth-pkce.ts`](packages/api/src/lib/oauth-pkce.ts) — verifier + S256 challenge helpers
- [`apps/gateway/src/apps.rs`](apps/gateway/src/apps.rs) — `airtable` provider, `AIRTABLE_REFRESH` with `FormWithBasicAuthRefresh`
- [`apps/gateway/src/connect.rs`](apps/gateway/src/connect.rs) — persist new `refresh_token` from refresh response when present

## Operator notes

- Token exchange runs **only on the server** (API callback in `packages/api` routes), never in the browser; Airtable does not support browser token creation ([OAuth reference — CORS](https://airtable.com/developers/web/api/oauth-reference#cross-origin-resource-sharing-cors)).
- Platform defaults: set `AIRTABLE_CLIENT_ID` and `AIRTABLE_CLIENT_SECRET` (see [CLAUDE.md](CLAUDE.md)); projects can override via app config (BYOC).

## Full reference

For API links, scopes, token lifetimes, and container/proxy usage, read [instructions.md](instructions.md).
