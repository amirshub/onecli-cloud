import { db } from "@onecli/db";
import { getCrypto } from "../providers";
import { ServiceError } from "./errors";
import { scopeOwnership, type ResourceScope } from "./resource-scope";

const GOOGLE_DRIVE_PROVIDER = "google-drive";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";

export interface GoogleDriveFolderRow {
  id: string;
  name: string;
  parentId: string | null;
}

const escapeDriveQuery = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export const listGoogleDriveFolders = async (
  scope: ResourceScope,
  connectionId: string,
  parentId?: string,
): Promise<GoogleDriveFolderRow[]> => {
  const connection = await db.appConnection.findFirst({
    where: {
      ...scopeOwnership(scope, connectionId),
      provider: GOOGLE_DRIVE_PROVIDER,
      status: "connected",
    },
    select: { credentials: true },
  });
  if (!connection) {
    throw new ServiceError("NOT_FOUND", "Connection not found");
  }

  if (!connection.credentials) {
    throw new ServiceError("BAD_REQUEST", "Connection has no credentials");
  }

  let creds: Record<string, unknown>;
  try {
    creds = JSON.parse(await getCrypto().decrypt(connection.credentials)) as Record<
      string,
      unknown
    >;
  } catch {
    throw new ServiceError(
      "BAD_REQUEST",
      "Failed to read connection credentials",
    );
  }

  const accessToken = creds.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new ServiceError("BAD_REQUEST", "Connection has no access token");
  }

  const parentQuery =
    parentId && parentId !== "root"
      ? `'${escapeDriveQuery(parentId)}' in parents`
      : "'root' in parents";

  const q = `mimeType='application/vnd.google-apps.folder' and trashed=false and ${parentQuery}`;
  const url = new URL(DRIVE_FILES_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("fields", "files(id,name,parents)");
  url.searchParams.set("orderBy", "folder,name");
  url.searchParams.set("pageSize", "100");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new ServiceError(
      "BAD_REQUEST",
      `Google Drive API returned ${res.status}`,
    );
  }

  const data = (await res.json()) as {
    files?: { id?: string; name?: string; parents?: string[] }[];
  };

  return (data.files ?? [])
    .filter(
      (f): f is { id: string; name: string; parents?: string[] } =>
        typeof f.id === "string" && typeof f.name === "string",
    )
    .map((f) => ({
      id: f.id,
      name: f.name,
      parentId: f.parents?.[0] ?? null,
    }));
};
