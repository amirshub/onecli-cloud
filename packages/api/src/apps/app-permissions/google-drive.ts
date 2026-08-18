import type { AppPermissionDefinition } from "./types";
import { googleDocsPermissions } from "./google-docs";
import { googleSheetsPermissions } from "./google-sheets";
import { googleSlidesPermissions } from "./google-slides";

const docsReadTools =
  googleDocsPermissions.groups.find((g) => g.category === "read")?.tools ?? [];
const docsWriteTools =
  googleDocsPermissions.groups.find((g) => g.category === "write")?.tools ??
  [];
const sheetsReadTools =
  googleSheetsPermissions.groups.find((g) => g.category === "read")?.tools ??
  [];
const sheetsWriteTools =
  googleSheetsPermissions.groups.find((g) => g.category === "write")?.tools ??
  [];
const slidesReadTools =
  googleSlidesPermissions.groups.find((g) => g.category === "read")?.tools ??
  [];
const slidesWriteTools =
  googleSlidesPermissions.groups.find((g) => g.category === "write")?.tools ??
  [];

export const googleDrivePermissions: AppPermissionDefinition = {
  provider: "google-drive",
  groups: [
    {
      category: "read",
      tools: [
        {
          id: "list_files",
          name: "List files",
          description: "List files in Google Drive",
          hostPattern: "www.googleapis.com",
          pathPattern: "/drive/v3/files",
          method: "GET",
        },
        {
          id: "get_file",
          name: "Get file",
          description: "Download a file from Google Drive",
          hostPattern: "www.googleapis.com",
          pathPattern: "/drive/v3/files/*",
          method: "GET",
        },
        {
          id: "get_file_metadata",
          name: "Get file metadata",
          description: "Retrieve metadata for a specific file",
          hostPattern: "www.googleapis.com",
          pathPattern: "/drive/v3/files/*",
          method: "GET",
        },
        {
          id: "search_files",
          name: "Search files",
          description: "Search for files matching a query",
          hostPattern: "www.googleapis.com",
          pathPattern: "/drive/v3/files",
          method: "GET",
        },
        ...docsReadTools,
        ...sheetsReadTools,
        ...slidesReadTools,
      ],
    },
    {
      category: "write",
      wildcard: {
        id: "write_all",
        name: "All Drive write operations",
        description:
          "Create, update, delete, and share files on www.googleapis.com/drive",
        hostPattern: "www.googleapis.com",
        pathPattern: "/drive/v3/*",
        aliasPatterns: ["/upload/drive/v3/*"],
        methods: ["POST", "PUT", "PATCH", "DELETE"],
      },
      tools: [
        {
          id: "create_file",
          name: "Create file",
          description: "Upload a new file to Google Drive",
          hostPattern: "www.googleapis.com",
          pathPattern: "/drive/v3/files",
          aliasPatterns: ["/upload/drive/v3/files"],
          method: "POST",
        },
        {
          id: "update_file",
          name: "Update file",
          description: "Update an existing file in Google Drive",
          hostPattern: "www.googleapis.com",
          pathPattern: "/drive/v3/files/*",
          aliasPatterns: ["/upload/drive/v3/files/*"],
          method: "PATCH",
        },
        {
          id: "delete_file",
          name: "Delete file",
          description: "Delete a file from Google Drive",
          hostPattern: "www.googleapis.com",
          pathPattern: "/drive/v3/files/*",
          method: "DELETE",
        },
        {
          id: "share_file",
          name: "Share file",
          description: "Create a permission to share a file",
          hostPattern: "www.googleapis.com",
          pathPattern: "/drive/v3/files/*/permissions",
          method: "POST",
        },
      ],
    },
    {
      category: "write",
      tools: [...docsWriteTools, ...sheetsWriteTools, ...slidesWriteTools],
    },
  ],
};
