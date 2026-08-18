import { apiGet } from "./client";
import type { GoogleDriveFolder } from "./types";

/** Subfolders of `parentId` for a google-drive connection (`root` = My Drive). */
export const folders = (connectionId: string, parentId: string) =>
  apiGet<GoogleDriveFolder[]>(
    `/v1/apps/google-drive/folders?connectionId=${encodeURIComponent(connectionId)}&parentId=${encodeURIComponent(parentId)}`,
  );
