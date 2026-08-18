# ASHUB Google Drive — reference

## OAuth scopes (`google-drive` provider)

```
openid
email
profile
https://www.googleapis.com/auth/drive.readonly
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/documents
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/presentations
```

Google Cloud Console: enable Drive API, Docs API, Sheets API, Slides API on the OAuth consent screen.

## API hosts

| API | Host | Gateway path |
|-----|------|--------------|
| Drive v3 | `www.googleapis.com` | `/drive/`, `/upload/drive/`, `/batch/drive/` |
| Google Docs | `docs.googleapis.com` | full host |
| Google Sheets | `sheets.googleapis.com` | full host |
| Google Slides | `slides.googleapis.com` | full host |

## Folder scoping (`driveFolders`)

- **Policy shape:** `{ "driveFolders": ["folderId1", "folderId2"] }`
- **Absent / cleared:** unrestricted — full Drive access
- **Browse API:** `GET /v1/apps/google-drive/folders?connectionId=<id>&parentId=root`
- **IDs:** opaque Drive folder IDs (not paths like Dropbox `folders`)

### Enforcement (this OSS gateway)

A file/document/spreadsheet/presentation is allowed when:

1. It is an allowed folder ID, or
2. An allowed folder ID appears in its ancestor chain (`files.get` with `fields=parents`)

Hard cases (when `driveFolders` is set):

- `files.list` without `'FOLDER_ID' in parents` → **403**
- Create without `parents` in the JSON body → **403**
- Drive batch API → **403**
- Shared drives → out of scope for v1

GitHub/Dropbox resource scoping remains Cloud-only. Do not attach `{ repositories }` / `{ folders }` on OSS — GitHub would withhold the credential, and Dropbox has no OSS guard.

## Why legacy apps are removed

Upstream registers `google-docs`, `google-sheets`, and `google-slides` as separate providers on the same hosts as `google-drive`. When an agent has connections for both, the gateway returns **409 MultipleProviders**. Removing legacy gateway providers ensures only `google-drive` matches Docs/Sheets/Slides hosts.

## API documentation

- [Drive API v3](https://developers.google.com/drive/api/reference/rest/v3)
- [Google Docs API](https://developers.google.com/docs/api/reference/rest)
- [Google Sheets API](https://developers.google.com/sheets/api/reference/rest)
- [Google Slides API](https://developers.google.com/slides/api/reference/rest)
