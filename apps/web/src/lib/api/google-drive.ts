import { apiGet } from "./client";
import type { GoogleDriveFolder } from "./types";

/** Subfolders of `parentId` (`root` = My Drive, `shared` = Shared with me). */
export const folders = (connectionId: string, parentId: string) =>
  apiGet<GoogleDriveFolder[]>(
    `/v1/apps/google-drive/folders?connectionId=${encodeURIComponent(connectionId)}&parentId=${encodeURIComponent(parentId)}`,
  );

/** Resolve saved folder IDs to names for the picker chips. */
export const namedFolders = (connectionId: string, ids: string[]) =>
  apiGet<GoogleDriveFolder[]>(
    `/v1/apps/google-drive/folders?connectionId=${encodeURIComponent(connectionId)}&ids=${ids.map(encodeURIComponent).join(",")}`,
  );
