---
name: airtable-ashub
description: >-
  Repeatable pattern for adding OAuth-like third-party apps to OneCLI (minimal
  diff from existing providers): confirm server-side token exchange when vendors
  forbid browser tokens; optional requiresPkce + HttpOnly cookie for code_verifier;
  narrow gateway RefreshConfig variants when token auth differs; persist rotated
  refresh_token; register AppDefinition + gateway AppProvider. Use when planning
  or implementing a new OAuth provider after Airtable.
disable-model-invocation: true
---

# OAuth-style app integrations (pattern)

Use **Airtable** as the reference implementation when adding the next provider. Keep changes **additive** and localized.

## 1. Vendor constraints

- If the vendor **does not allow token exchange from the browser** (CORS) or requires a **client secret**, keep the **authorization** redirect in the browser but run **`POST …/token` only on the server** (API `callback` in [`packages/api/src/routes/apps.ts`](packages/api/src/routes/apps.ts) calling `exchangeCode`), matching existing OneCLI apps.
- Read the vendor’s OAuth doc for: authorize URL, token URL, scope delimiter, PKCE requirements, and how client credentials are sent on token calls (body vs `Authorization: Basic`).

## 2. API package (`packages/api`)

- Add a module under [`packages/api/src/apps/`](packages/api/src/apps/) implementing `AppDefinition` with `connectionMethod.type: "oauth"`.
- Register it in [`packages/api/src/apps/registry.ts`](packages/api/src/apps/registry.ts).
- If **PKCE** is required: set `requiresPkce: true` on the oauth method; implement `buildAuthUrl` / `exchangeCode` using optional `codeChallenge` / `codeChallengeMethod` / `codeVerifier` from [`types.ts`](packages/api/src/apps/types.ts). **Do not** put the raw `code_verifier` inside signed `state` if the vendor limits `state` size or charset — use the shared **HttpOnly cookie** path in authorize/callback in [`apps.ts`](packages/api/src/routes/apps.ts) (see [`oauth-pkce.ts`](packages/api/src/lib/oauth-pkce.ts)).

## 3. Gateway (`apps/gateway`)

- Add an `AppProvider` in [`apps/gateway/src/apps.rs`](apps/gateway/src/apps.rs): host rules (usually `Exact` API hostname), `AuthStrategy::Bearer` for APIs that use bearer tokens, and `refresh: Some(&YOUR_REFRESH)` when access tokens expire.
- If refresh uses a **different** client-auth shape than existing `TokenBodyFormat::Form` / `Json`, add a **new** `TokenBodyFormat` variant only for that provider (see `FormWithBasicAuthRefresh` for Airtable) instead of changing Google/Atlassian/Todoist behavior.
- If the vendor **rotates refresh tokens**, ensure [`connect.rs`](apps/gateway/src/connect.rs) persists the new `refresh_token` from the refresh response when present (same pattern as Airtable).

## 4. Environment and docs

- Document new `*_CLIENT_ID` / `*_CLIENT_SECRET` (or equivalent) in [CLAUDE.md](CLAUDE.md) when the platform supplies defaults.

## 5. Concrete template

Walk the **Airtable** file set listed in [`../airtable-onecli-ashub/SKILL.md`](../airtable-onecli-ashub/SKILL.md) and mirror the smallest subset needed for the new vendor.
