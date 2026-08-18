import { Folder } from "lucide-react";
import type { GranularAccessConfig } from "../types";

export const googleDriveConfig: GranularAccessConfig = {
  isSupported: () => true,
  getItems: () => [],
  buildPolicy: (folderIds) =>
    folderIds.length > 0 ? { driveFolders: folderIds } : {},
  getSelectedItems: (policy) => (policy.driveFolders as string[]) ?? [],
  itemLabel: { singular: "folder", plural: "folders" },
  Icon: Folder,
  formatSummary: (policy) => {
    const folders = (policy?.driveFolders as string[] | undefined) ?? [];
    return folders.length > 0
      ? `${folders.length} ${folders.length === 1 ? "folder" : "folders"}`
      : "All folders";
  },
};
