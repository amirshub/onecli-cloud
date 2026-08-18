import { db } from "@onecli/db";
import { getCrypto } from "../providers";
import { googleDrive } from "../apps/google-drive";
import { googleDriveCanListFolders } from "../apps/google-drive-scopes";
import { refreshGoogleAccessToken } from "../apps/oauth/google";
import { resolveAppCredentials } from "../apps/resolve-credentials";
import { getAppConfigCredentialsById } from "./app-config-service";
import { ServiceError } from "./errors";
import { scopeWhere, type ResourceScope } from "./resource-scope";

const GOOGLE_DRIVE_PROVIDER = "google-drive";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const TOKEN_SKEW_SECONDS = 60;
const FOLDER_MIME = "application/vnd.google-apps.folder";

/** Virtual parent for the My Drive listing (`'root' in parents`). */
export const GOOGLE_DRIVE_MY_DRIVE = "root";
/** Virtual parent for folders others have shared with this account. */
export const GOOGLE_DRIVE_SHARED_WITH_ME = "shared";

const MAX_LOOKUP_IDS = 100;

export interface GoogleDriveFolderRow {
  id: string;
  name: string;
  parentId: string | null;
}

const escapeDriveQuery = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

const tokenExpired = (expiresAt: unknown): boolean => {
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) {
    return false;
  }
  return expiresAt <= Math.floor(Date.now() / 1000) + TOKEN_SKEW_SECONDS;
};

const resolveGoogleOAuthClient = async (connection: {
  appConfigId: string | null;
  projectId: string | null;
  organizationId: string | null;
}): Promise<{ clientId: string; clientSecret: string } | null> => {
  if (connection.appConfigId) {
    const fields = await getAppConfigCredentialsById(connection.appConfigId);
    if (fields?.clientId && fields.clientSecret) {
      return { clientId: fields.clientId, clientSecret: fields.clientSecret };
    }
  }
  if (connection.projectId) {
    const resolved = await resolveAppCredentials(
      connection.projectId,
      googleDrive,
      connection.organizationId ?? undefined,
    );
    if (resolved?.values.clientId && resolved.values.clientSecret) {
      return {
        clientId: resolved.values.clientId,
        clientSecret: resolved.values.clientSecret,
      };
    }
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (clientId && clientSecret) {
    return { clientId, clientSecret };
  }
  return null;
};

type DriveGet = (url: URL) => Promise<Response>;

const openDriveSession = async (
  scope: ResourceScope,
  connectionId: string,
): Promise<DriveGet> => {
  const connection = await db.appConnection.findFirst({
    where: {
      id: connectionId,
      ...scopeWhere(scope),
      provider: GOOGLE_DRIVE_PROVIDER,
      status: "connected",
    },
    select: {
      id: true,
      credentials: true,
      scopes: true,
      appConfigId: true,
      projectId: true,
      organizationId: true,
    },
  });
  if (!connection) {
    throw new ServiceError("NOT_FOUND", "Connection not found");
  }

  if (!googleDriveCanListFolders(connection.scopes)) {
    throw new ServiceError(
      "BAD_REQUEST",
      "Reconnect this Google Drive account to list folders.",
    );
  }

  if (!connection.credentials) {
    throw new ServiceError("BAD_REQUEST", "Connection has no credentials");
  }

  let creds: Record<string, unknown>;
  try {
    creds = JSON.parse(
      await getCrypto().decrypt(connection.credentials),
    ) as Record<string, unknown>;
  } catch {
    throw new ServiceError(
      "BAD_REQUEST",
      "Failed to read connection credentials",
    );
  }

  const persistCreds = async (next: Record<string, unknown>) => {
    creds = next;
    await db.appConnection.update({
      where: { id: connection.id },
      data: {
        credentials: await getCrypto().encrypt(JSON.stringify(next)),
      },
    });
  };

  const refreshIfPossible = async (): Promise<boolean> => {
    const refreshToken = creds.refresh_token;
    if (typeof refreshToken !== "string" || !refreshToken) return false;
    const client = await resolveGoogleOAuthClient(connection);
    if (!client) return false;
    try {
      const refreshed = await refreshGoogleAccessToken(
        refreshToken,
        client.clientId,
        client.clientSecret,
      );
      await persistCreds({
        ...creds,
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_at: refreshed.expires_at,
      });
      return true;
    } catch {
      return false;
    }
  };

  if (tokenExpired(creds.expires_at)) {
    const refreshed = await refreshIfPossible();
    if (!refreshed) {
      throw new ServiceError(
        "BAD_REQUEST",
        "This Google Drive connection's token expired. Reconnect the account.",
      );
    }
  }

  const token = (): string => {
    const accessToken = creds.access_token;
    if (typeof accessToken !== "string" || !accessToken) {
      throw new ServiceError("BAD_REQUEST", "Connection has no access token");
    }
    return accessToken;
  };

  return async (url: URL) => {
    let res = await fetch(url, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (res.status === 401) {
      const refreshed = await refreshIfPossible();
      const nextToken = creds.access_token;
      if (refreshed && typeof nextToken === "string" && nextToken) {
        res = await fetch(url, {
          headers: { Authorization: `Bearer ${nextToken}` },
        });
      }
    }
    return res;
  };
};

const throwIfDriveFailed = (res: Response) => {
  if (res.ok) return;
  if (res.status === 401 || res.status === 403) {
    throw new ServiceError(
      "BAD_REQUEST",
      "Reconnect this Google Drive account to list folders.",
    );
  }
  throw new ServiceError(
    "BAD_REQUEST",
    `Google Drive API returned ${res.status}`,
  );
};

const listUrl = (parentId?: string): URL => {
  const location =
    parentId && parentId.length > 0 ? parentId : GOOGLE_DRIVE_MY_DRIVE;
  const url = new URL(DRIVE_FILES_URL);
  let q = `mimeType='${FOLDER_MIME}' and trashed=false`;
  if (location === GOOGLE_DRIVE_SHARED_WITH_ME) {
    q += " and sharedWithMe=true";
  } else if (location === GOOGLE_DRIVE_MY_DRIVE) {
    q += " and 'root' in parents";
  } else {
    q += ` and '${escapeDriveQuery(location)}' in parents`;
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
  }
  url.searchParams.set("q", q);
  url.searchParams.set("fields", "files(id,name,parents)");
  url.searchParams.set("pageSize", "100");
  return url;
};

const mapFiles = (
  files: { id?: string; name?: string; parents?: string[] }[],
): GoogleDriveFolderRow[] =>
  files
    .filter(
      (f): f is { id: string; name: string; parents?: string[] } =>
        typeof f.id === "string" && typeof f.name === "string",
    )
    .map((f) => ({
      id: f.id,
      name: f.name,
      parentId: f.parents?.[0] ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

export const listGoogleDriveFolders = async (
  scope: ResourceScope,
  connectionId: string,
  parentId?: string,
): Promise<GoogleDriveFolderRow[]> => {
  const driveGet = await openDriveSession(scope, connectionId);
  const res = await driveGet(listUrl(parentId));
  throwIfDriveFailed(res);
  const data = (await res.json()) as {
    files?: { id?: string; name?: string; parents?: string[] }[];
  };
  return mapFiles(data.files ?? []);
};

/** Resolve folder IDs to names (selected chips persist IDs only). */
export const lookupGoogleDriveFolders = async (
  scope: ResourceScope,
  connectionId: string,
  ids: string[],
): Promise<GoogleDriveFolderRow[]> => {
  const unique = [...new Set(ids.filter((id) => id.length > 0))].slice(
    0,
    MAX_LOOKUP_IDS,
  );
  if (unique.length === 0) return [];

  const driveGet = await openDriveSession(scope, connectionId);
  const rows = await Promise.all(
    unique.map(async (id) => {
      const url = new URL(`${DRIVE_FILES_URL}/${encodeURIComponent(id)}`);
      url.searchParams.set("fields", "id,name,parents");
      url.searchParams.set("supportsAllDrives", "true");
      const res = await driveGet(url);
      if (res.status === 404) return null;
      throwIfDriveFailed(res);
      const file = (await res.json()) as {
        id?: string;
        name?: string;
        parents?: string[];
      };
      if (typeof file.id !== "string" || typeof file.name !== "string") {
        return null;
      }
      return {
        id: file.id,
        name: file.name,
        parentId: file.parents?.[0] ?? null,
      };
    }),
  );
  return rows.filter((row): row is GoogleDriveFolderRow => row !== null);
};
