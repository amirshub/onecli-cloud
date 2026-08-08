# Airtable API and OAuth (reference)

Official documentation (read these for endpoint details and product behavior):

- [API introduction](https://airtable.com/developers/web/api/introduction)
- [OAuth integrations guide](https://airtable.com/developers/web/guides/oauth-integrations)
- [OAuth reference](https://airtable.com/developers/web/api/oauth-reference) (authorize URL, token URL, PKCE, Basic auth, refresh, rotating tokens)
- [Scopes](https://airtable.com/developers/web/api/scopes)
- [Authentication](https://airtable.com/developers/web/api/authentication) — use `Authorization: Bearer` for API calls
- [Get user info / whoami](https://airtable.com/developers/web/api/get-user-id-scopes) — `GET https://api.airtable.com/v0/meta/whoami` (email when `user.email:read` is granted)
- [List bases](https://airtable.com/developers/web/api/list-bases)

## OneCLI behavior

1. **Connect** in the dashboard uses the web app OAuth flow: browser redirect to Airtable, then callback on the server exchanges the `code` for tokens (with PKCE `code_verifier` from an HttpOnly cookie).
2. **Gateway**: outbound HTTPS from an agent through OneCLI injects `Authorization: Bearer <access_token>` for host `api.airtable.com` when an `airtable` app connection applies. Expired access tokens are refreshed server-side in the gateway; Airtable returns a **new** `refresh_token` on each refresh — OneCLI persists it when present.
3. **Scopes**: the scopes requested in code (`defaultScopes` in `airtable.ts`) must be enabled for your integration at [airtable.com/create/oauth](https://airtable.com/create/oauth). Mismatch causes `invalid_scope` at authorize time.

## Token notes (from Airtable docs)

- Access tokens are short-lived (order of ~60 minutes); use refresh tokens before expiry.
- Refresh tokens rotate: the previous refresh token is invalidated when a new one is issued.
- Treat access and refresh tokens as opaque strings (length/format may change).
- Very frequent invalid refresh attempts can lead to revocation; avoid hammering the token endpoint (order of ~10 requests/second per token mentioned in docs).
- HTTP **409** on refresh can indicate a recent conflicting refresh for the same token.

## Containers

With gateway proxy env from OneCLI `container-config`, call `https://api.airtable.com/...` as usual; do not embed PATs if you rely on the connected `airtable` app connection for injection.
