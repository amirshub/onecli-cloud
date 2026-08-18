---
name: google-drive-onecli-ashub
description: >-
  ASHUB fork customization: unified "ASHUB Google Drive" connector (provider
  google-drive) with Drive+Docs+Sheets+Slides scopes, merged app-permissions,
  legacy google-docs/sheets/slides retirement, optional driveFolders scoping.
  Use after merging upstream OneCLI to re-apply the consolidated Google Workspace
  integration.
disable-model-invocation: true
---

# ASHUB Google Drive on OneCLI

Use this skill after `git merge upstream/main` (or similar) when upstream re-introduces separate Google Docs/Sheets/Slides apps. Re-apply the fork customization in order.

## Quick checklist

| Step | Files |
|------|-------|
| Retire legacy apps | [`registry.ts`](packages/api/src/apps/registry.ts), [`app-categories.ts`](apps/web/src/app/(dashboard)/connections/_components/app-categories.ts) |
| Gateway precedence | [`apps.rs`](apps/gateway/src/apps.rs) — delete `google-docs`/`sheets`/`slides` `AppProvider` blocks |
| Rename | [`google-drive.ts`](packages/api/src/apps/google-drive.ts), `display_name` in `apps.rs` → **ASHUB Google Drive** |
| OAuth scopes | `defaultScopes` + `permissions` in `google-drive.ts` (see [instructions.md](instructions.md)) |
| Merge permissions | [`google-drive.ts`](packages/api/src/apps/app-permissions/google-drive.ts) — import tools from legacy permission files |
| Regenerate catalog | [`catalog.generated.json`](apps/gateway/src/policy_engine/catalog.generated.json) |
| Folder scoping | `driveFolders` schema + browse API + **OSS gateway request guard** (`drive_folder_guard.rs`, `has_request_guard`, inject-select attach, folder picker) |
| DB migration | [`20260818103000_migrate_google_workspace_connections`](packages/db/prisma/migrations/20260818103000_migrate_google_workspace_connections/migration.sql) |
| Reconnect UX | [`google-drive-scopes.ts`](packages/api/src/apps/google-drive-scopes.ts), [`connection-account-card.tsx`](apps/web/src/app/(dashboard)/connections/_components/connection-account-card.tsx) |

## 1. Upstream diff sanity

After merge, confirm upstream restored:

- `googleDocs`, `googleSheets`, `googleSlides` in [`registry.ts`](packages/api/src/apps/registry.ts) `staticApps`
- Three `AppProvider` blocks in [`apps.rs`](apps/gateway/src/apps.rs) for `docs.googleapis.com`, `sheets.googleapis.com`, `slides.googleapis.com`
- Separate permission catalogs under `google-docs` / `google-sheets` / `google-slides` provider IDs

## 2. Retire legacy connectors

**Registry** — remove imports and `staticApps` entries for `google-docs`, `google-sheets`, `google-slides`. Keep `google-drive` only.

**App categories** — remove `"google-docs"`, `"google-sheets"`, `"google-slides"` from [`app-categories.ts`](apps/web/src/app/(dashboard)/connections/_components/app-categories.ts).

**Gateway** — delete the three legacy `AppProvider` blocks in `apps.rs`. Only `google-drive` should match Docs/Sheets/Slides hosts.

**Keep temporarily** (until DB is clean): legacy permission files + `register()` in [`app-permissions/index.ts`](packages/api/src/apps/app-permissions/index.ts) for existing policy rules referencing old provider IDs.

## 3. Rename to ASHUB Google Drive

- `packages/api/src/apps/google-drive.ts` → `name: "ASHUB Google Drive"`
- `apps/gateway/src/apps.rs` → `display_name: "ASHUB Google Drive"` on the `google-drive` provider

Update gateway tests asserting display name strings.

## 4. OAuth scopes

Ensure `google-drive.ts` `defaultScopes` includes Drive + Docs + Sheets + Slides (see [instructions.md](instructions.md)). Users must **reconnect** to gain new scopes.

## 5. Gateway host rules (google-drive only)

Confirm `google-drive` has six host rules:

1. `www.googleapis.com` + `/drive/`
2. `www.googleapis.com` + `/upload/drive/`
3. `www.googleapis.com` + `/batch/drive/`
4. `docs.googleapis.com` (full host)
5. `sheets.googleapis.com` (full host)
6. `slides.googleapis.com` (full host)

No legacy provider blocks on those subdomains.

## 6. Merge app-permissions

In [`google-drive.ts`](packages/api/src/apps/app-permissions/google-drive.ts), spread read/write tools from:

- [`google-docs.ts`](packages/api/src/apps/app-permissions/google-docs.ts)
- [`google-sheets.ts`](packages/api/src/apps/app-permissions/google-sheets.ts)
- [`google-slides.ts`](packages/api/src/apps/app-permissions/google-slides.ts)

Regenerate [`catalog.generated.json`](apps/gateway/src/policy_engine/catalog.generated.json) — the `google-drive` section must include docs/sheets/slides hosts.

## 7. Folder scoping (`driveFolders`) — enforced on this OSS gateway

Session policy shape: `{ driveFolders: string[] }` — Google Drive folder IDs. Absent = full Drive access.

Google OAuth tokens cannot be folder-scoped. The stored credential is injected as-is; the **OSS gateway request guard** refuses calls outside the allowlist (file ID or ancestor folder).

| Layer | Location |
|-------|----------|
| Schema | `sessionPolicySchema` in `packages/api/src/validations/policy.ts` |
| Composition | `driveFolders` axis in `packages/api/src/lib/resource-axis.ts` |
| OSS validator | `packages/api/src/services/policy-oss-locks.ts` — allow `google-drive` + `driveFolders`; 422 GitHub/Dropbox |
| Inject attach | `apps/gateway/src/policy_engine/inject_select.rs` — attach `driveFolders` only |
| Request guard | `apps/gateway/src/drive_folder_guard.rs` + OSS `hooks.rs` `pre_forward` |
| `has_request_guard` | `apps/gateway/src/ee_apps.rs` — `google-drive` is true so the token is not withheld |
| Browse API | `GET /v1/apps/google-drive/folders?connectionId=&parentId=` |
| Service | `packages/api/src/services/google-drive-folders-service.ts` |
| Web picker | `apps/web/src/lib/policy-editor/google-drive-folder-scope.tsx` |
| Granular access | `apps/web/src/lib/granular-access/configs/google-drive.ts` + register in `index.ts` |
| Grant types | `GrantResources` in `apps/web/src/lib/api/types.ts` |

A file/document/spreadsheet/presentation is allowed when its ID or an ancestor is in `driveFolders`. Unscoped `files.list`, creates without `parents`, and Drive batch calls are denied when a folder limit is set. GitHub/Dropbox scoping remains Cloud-only.

## 8. DB migration

```sql
UPDATE "app_connections"
SET "provider" = 'google-drive'
WHERE "provider" IN ('google-docs', 'google-sheets', 'google-slides');
```

Migration: [`20260818103000_migrate_google_workspace_connections`](packages/db/prisma/migrations/20260818103000_migrate_google_workspace_connections/migration.sql).

## 9. Verification

```bash
pnpm check
pnpm --filter @onecli/api test
cd apps/gateway && cargo test google_drive && cargo test drive_folder && cargo test google_drive_keeps_credential
```

Manual:

1. Connect **ASHUB Google Drive** in dashboard
2. Proxy `docs.googleapis.com/v1/documents/...` through gateway
3. Optional: set `driveFolders` on a connection rule; browse folders in policy UI

## 10. Post-migration cleanup

Once no DB rows reference `google-docs` / `google-sheets` / `google-slides`:

- Delete `packages/api/src/apps/google-{docs,sheets,slides}.ts`
- Delete legacy permission files (if policy rules migrated)
- Remove legacy sections from `catalog.generated.json`

## Full reference

See [instructions.md](instructions.md) for API links, scope list, and folder guard semantics.
