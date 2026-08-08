---
name: google-drive-ashum
description: >-
  Google Drive on OneCLI as a unified Workspace connection: OAuth provider
  google-drive with Drive + Docs + Sheets + Slides API scopes, gateway Bearer
  injection on www.googleapis.com/drive/* and docs/sheets/slides.googleapis.com.
  Use for single sign-on to Drive, Docs, Sheets, and Slides through one app
  connection instead of separate google-docs/sheets/slides connections.
disable-model-invocation: true
---

# Google Drive (unified Workspace) on OneCLI

Use this skill when implementing or debugging **one OAuth connection** for Google Drive, Docs, Sheets, and Slides (provider id `google-drive`).

## Why one connection

Historically Docs, Sheets, and Slides were separate dashboard apps with only Drive file scopes. The **`google-drive`** app now requests document API scopes and the gateway routes Docs/Sheets/Slides API hosts to the same provider, so agents need a single `google-drive` `AppConnection` for:

| API           | Host                                                                |
| ------------- | ------------------------------------------------------------------- |
| Drive v3      | `www.googleapis.com` (`/drive/`, `/upload/drive/`, `/batch/drive/`) |
| Google Docs   | `docs.googleapis.com`                                               |
| Google Sheets | `sheets.googleapis.com`                                             |
| Google Slides | `slides.googleapis.com`                                             |

Prefer **`google-drive`** over connecting `google-docs`, `google-sheets`, or `google-slides` separately to avoid duplicate tokens and ambiguous multi-provider injection on the same host.

## OAuth scopes (`packages/api/src/apps/google-drive.ts`)

`defaultScopes` include:

- OpenID: `openid`, `email`, `profile`
- Drive: `drive.readonly`, `drive.file`
- Docs: `https://www.googleapis.com/auth/documents`
- Sheets: `https://www.googleapis.com/auth/spreadsheets`
- Slides: `https://www.googleapis.com/auth/presentations`

`permissions` mirrors these for the connections UI.

Shared OAuth helpers: [`packages/api/src/apps/oauth/google.ts`](packages/api/src/apps/oauth/google.ts) (`buildGoogleAuthUrl`, `exchangeGoogleCode`, `prompt=consent`, `access_type=offline`).

Authorize route reads `defaultScopes` from the app definition: [`packages/api/src/routes/apps.ts`](packages/api/src/routes/apps.ts).

## Google Cloud Console

Enable the same scopes on your OAuth client consent screen (Drive API, Google Docs API, Google Sheets API, Google Slides API). Scope mismatch causes `invalid_scope` at authorize time.

## Gateway (`apps/gateway/src/apps.rs`)

Provider `google-drive` host rules:

1. `www.googleapis.com` with path prefixes `/drive/`, `/upload/drive/`, `/batch/drive/`
2. Catch-all on `docs.googleapis.com`, `sheets.googleapis.com`, `slides.googleapis.com`

Uses `GOOGLE_REFRESH` (form body token refresh).

`provider_for_host` returns the **first** matching provider in registry order; `google-drive` is registered before `google-docs` / `google-sheets` / `google-slides`, so dedicated subdomains resolve to **Google Drive** when labeling connections.

`providers_for_host` may still list legacy providers (`google-docs`, etc.) if their host rules remain; only connections whose `provider` matches are injected. With a single `google-drive` connection, injection works even when multiple static providers match a host.

## Re-authorization

Existing connections do **not** gain new scopes automatically. Users must **reconnect** Google Drive in the dashboard so Google issues a token that includes Docs/Sheets/Slides scopes.

## Separate apps (legacy)

[`google-docs.ts`](packages/api/src/apps/google-docs.ts), [`google-sheets.ts`](packages/api/src/apps/google-sheets.ts), [`google-slides.ts`](packages/api/src/apps/google-slides.ts) remain in the registry for backward compatibility but still request only Drive scopes. New work should extend **`google-drive`** only.

## Verification

- `pnpm check`
- `cargo test -p onecli-gateway` (or workspace gateway crate name) — `google_drive_injects_on_docs_sheets_slides_hosts`, updated workspace host provider tests
- Connect **Google Drive** → call `https://docs.googleapis.com/v1/documents/...` through the gateway proxy with agent access to that connection

## API reference

See [instructions.md](instructions.md) for Google API doc links.
