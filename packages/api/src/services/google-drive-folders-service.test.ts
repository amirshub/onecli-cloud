import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceError } from "./errors";

const findFirst = vi.fn();
const update = vi.fn();
const getAppConfigCredentialsById = vi.fn();
const resolveAppCredentials = vi.fn();
const decrypt = vi.fn();
const encrypt = vi.fn();

vi.mock("@onecli/db", () => ({
  db: {
    appConnection: {
      findFirst: (...args: unknown[]) => findFirst(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

vi.mock("../providers", () => ({
  getCrypto: () => ({
    decrypt: (...args: unknown[]) => decrypt(...args),
    encrypt: (...args: unknown[]) => encrypt(...args),
  }),
}));

vi.mock("./app-config-service", () => ({
  getAppConfigCredentialsById: (...args: unknown[]) =>
    getAppConfigCredentialsById(...args),
}));

vi.mock("../apps/resolve-credentials", () => ({
  resolveAppCredentials: (...args: unknown[]) => resolveAppCredentials(...args),
}));

import {
  listGoogleDriveFolders,
  lookupGoogleDriveFolders,
} from "./google-drive-folders-service";

const SCOPE = { projectId: "p1", organizationId: "o1" };

const driveRow = (overrides: Record<string, unknown> = {}) => ({
  id: "c1",
  credentials: "enc",
  scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  appConfigId: null,
  projectId: "p1",
  organizationId: "o1",
  ...overrides,
});

beforeEach(() => {
  findFirst.mockReset();
  update.mockReset();
  getAppConfigCredentialsById.mockReset();
  resolveAppCredentials.mockReset();
  decrypt.mockReset();
  encrypt.mockReset();
  vi.unstubAllGlobals();
});

describe("listGoogleDriveFolders lookup", () => {
  it("finds project-scoped connections when the caller has both project and org", async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      listGoogleDriveFolders(SCOPE, "c1", "root"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: "c1",
        OR: [
          { projectId: "p1" },
          { organizationId: "o1", scope: "organization" },
        ],
        provider: "google-drive",
        status: "connected",
      },
      select: expect.any(Object),
    });
  });

  it("asks to reconnect when the token cannot list Drive folders", async () => {
    findFirst.mockResolvedValue(
      driveRow({ scopes: ["https://www.googleapis.com/auth/documents"] }),
    );

    await expect(listGoogleDriveFolders(SCOPE, "c1")).rejects.toBeInstanceOf(
      ServiceError,
    );
    await expect(listGoogleDriveFolders(SCOPE, "c1")).rejects.toMatchObject({
      message: "Reconnect this Google Drive account to list folders.",
    });
  });
});

describe("listGoogleDriveFolders Drive API", () => {
  it("lists My Drive folders with a live token", async () => {
    findFirst.mockResolvedValue(driveRow());
    decrypt.mockResolvedValue(
      JSON.stringify({
        access_token: "ya29.live",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      }),
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        files: [{ id: "fold-1", name: "Clients", parents: ["root"] }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const folders = await listGoogleDriveFolders(SCOPE, "c1", "root");
    expect(folders).toEqual([
      { id: "fold-1", name: "Clients", parentId: "root" },
    ]);
    const listed = decodeURIComponent(
      String(fetchMock.mock.calls[0]?.[0]).replaceAll("+", " "),
    );
    expect(listed).toContain("q=");
    expect(listed).toContain("'root' in parents");
    expect(listed).not.toContain("sharedWithMe");
    expect(update).not.toHaveBeenCalled();
  });

  it("lists Shared with me folders", async () => {
    findFirst.mockResolvedValue(driveRow());
    decrypt.mockResolvedValue(
      JSON.stringify({
        access_token: "ya29.live",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      }),
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        files: [{ id: "shared-1", name: "Vendor docs" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const folders = await listGoogleDriveFolders(SCOPE, "c1", "shared");
    expect(folders).toEqual([
      { id: "shared-1", name: "Vendor docs", parentId: null },
    ]);
    expect(decodeURIComponent(String(fetchMock.mock.calls[0]?.[0]))).toContain(
      "sharedWithMe=true",
    );
  });

  it("lists children of a shared folder with all-drives flags", async () => {
    findFirst.mockResolvedValue(driveRow());
    decrypt.mockResolvedValue(
      JSON.stringify({
        access_token: "ya29.live",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      }),
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ files: [{ id: "child-1", name: "Q1" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await listGoogleDriveFolders(SCOPE, "c1", "1abcSharedFolder");
    const listed = decodeURIComponent(
      String(fetchMock.mock.calls[0]?.[0]).replaceAll("+", " "),
    );
    expect(listed).toContain("supportsAllDrives=true");
    expect(listed).toContain("includeItemsFromAllDrives=true");
    expect(listed).toContain("'1abcSharedFolder' in parents");
  });

  it("refreshes an expired token before listing", async () => {
    findFirst.mockResolvedValue(driveRow());
    decrypt.mockResolvedValue(
      JSON.stringify({
        access_token: "ya29.old",
        refresh_token: "1//rt",
        expires_at: Math.floor(Date.now() / 1000) - 10,
      }),
    );
    encrypt.mockImplementation(async (s: string) => s);
    process.env.GOOGLE_CLIENT_ID = "cid";
    process.env.GOOGLE_CLIENT_SECRET = "csecret";

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: "ya29.new",
            expires_in: 3600,
          }),
          text: async () => "",
        };
      }
      expect(url).toContain("/drive/v3/files");
      return {
        ok: true,
        status: 200,
        json: async () => ({ files: [{ id: "f2", name: "Inbox" }] }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const folders = await listGoogleDriveFolders(SCOPE, "c1");
    expect(folders).toEqual([{ id: "f2", name: "Inbox", parentId: null }]);
    expect(update).toHaveBeenCalled();
    const driveCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/drive/v3/files"),
    );
    expect(driveCall?.[1]).toMatchObject({
      headers: { Authorization: "Bearer ya29.new" },
    });
  });
});

describe("lookupGoogleDriveFolders", () => {
  it("resolves saved folder IDs to names", async () => {
    findFirst.mockResolvedValue(driveRow());
    decrypt.mockResolvedValue(
      JSON.stringify({
        access_token: "ya29.live",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      }),
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "1axSYGgw8emrMctRUpOq8Tje",
        name: "Client vault",
        parents: ["root"],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const folders = await lookupGoogleDriveFolders(SCOPE, "c1", [
      "1axSYGgw8emrMctRUpOq8Tje",
    ]);
    expect(folders).toEqual([
      {
        id: "1axSYGgw8emrMctRUpOq8Tje",
        name: "Client vault",
        parentId: "root",
      },
    ]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/drive/v3/files/1axSYGgw8emrMctRUpOq8Tje",
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "supportsAllDrives=true",
    );
  });
});
