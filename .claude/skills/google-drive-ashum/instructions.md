# Google Workspace APIs (reference)

Official documentation:

- [Google Drive API](https://developers.google.com/drive/api/guides/about-sdk)
- [Google Docs API](https://developers.google.com/docs/api/how-tos/overview)
- [Google Sheets API](https://developers.google.com/sheets/api/guides/concepts)
- [Google Slides API](https://developers.google.com/slides/api/guides/overview)
- [OAuth 2.0 scopes](https://developers.google.com/identity/protocols/oauth2/scopes)

## Scopes used by OneCLI `google-drive`

| Scope                                            | Purpose                                        |
| ------------------------------------------------ | ---------------------------------------------- |
| `https://www.googleapis.com/auth/drive.readonly` | List/read Drive files                          |
| `https://www.googleapis.com/auth/drive.file`     | Create/edit files opened or created by the app |
| `https://www.googleapis.com/auth/documents`      | Docs API read/write                            |
| `https://www.googleapis.com/auth/spreadsheets`   | Sheets API read/write                          |
| `https://www.googleapis.com/auth/presentations`  | Slides API read/write                          |

## OneCLI behavior

1. **Connect** in the dashboard → OAuth redirect → callback exchanges code via `exchangeGoogleCode`.
2. **Gateway**: outbound HTTPS injects `Authorization: Bearer <access_token>` for Drive and Docs/Sheets/Slides hosts when a `google-drive` app connection applies. Tokens refresh via Google's token endpoint in the gateway.
3. **Containers**: use gateway proxy env from OneCLI `container-config`; call Google API URLs as usual without embedding user tokens in the agent image.
