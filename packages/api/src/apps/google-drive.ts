import type { AppDefinition } from "./types";
import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  googleConfigFields,
  googleEnvDefaults,
} from "./oauth/google";

export const googleDrive: AppDefinition = {
  id: "google-drive",
  name: "ASHUB Google Drive",
  icon: "/icons/google-drive.svg",
  description:
    "Drive, Docs, Sheets, and Slides — files, folders, and document APIs in one connection.",
  connectionMethod: {
    type: "oauth",
    defaultScopes: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/presentations",
    ],
    permissions: [
      {
        scope: "https://www.googleapis.com/auth/drive.readonly",
        name: "Read files",
        description: "View and download all your Drive files",
        access: "read",
      },
      {
        scope: "https://www.googleapis.com/auth/drive.file",
        name: "Manage app files",
        description: "Create and edit files opened or created by OneCLI",
        access: "write",
      },
      {
        scope: "https://www.googleapis.com/auth/documents",
        name: "Google Docs",
        description: "View and edit Google Docs documents",
        access: "write",
      },
      {
        scope: "https://www.googleapis.com/auth/spreadsheets",
        name: "Google Sheets",
        description: "View and edit Google Sheets spreadsheets",
        access: "write",
      },
      {
        scope: "https://www.googleapis.com/auth/presentations",
        name: "Google Slides",
        description: "View and edit Google Slides presentations",
        access: "write",
      },
      {
        scope: "https://www.googleapis.com/auth/userinfo.email",
        name: "Email address",
        description: "View your email address",
        access: "read",
      },
      {
        scope: "https://www.googleapis.com/auth/userinfo.profile",
        name: "Profile",
        description: "Name and profile picture",
        access: "read",
      },
    ],
    buildAuthUrl: buildGoogleAuthUrl,
    exchangeCode: exchangeGoogleCode,
  },
  available: true,
  configurable: {
    fields: googleConfigFields,
    envDefaults: googleEnvDefaults,
  },
};
