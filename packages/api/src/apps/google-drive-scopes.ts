/** Scopes required for unified ASHUB Google Drive (Docs + Sheets + Slides). */
export const GOOGLE_DRIVE_UNIFIED_SCOPES = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/presentations",
] as const;

const DRIVE_LIST_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive",
] as const;

/** True when a google-drive connection lacks Docs/Sheets/Slides scopes. */
export const googleDriveNeedsReconnect = (
  provider: string,
  scopes: string[],
): boolean =>
  provider === "google-drive" &&
  !GOOGLE_DRIVE_UNIFIED_SCOPES.every((scope) => scopes.includes(scope));

/** `drive.file` is not enough to list My Drive folders. */
export const googleDriveCanListFolders = (scopes: string[]): boolean =>
  DRIVE_LIST_SCOPES.some((scope) => scopes.includes(scope));
