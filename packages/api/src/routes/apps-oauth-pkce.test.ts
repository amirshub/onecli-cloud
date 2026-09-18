import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Hono } from "hono";
import type { ApiEnv } from "../types";

/**
 * Airtable (and any `requiresPkce` app) must recover the code_verifier after
 * the provider bounces the browser back. These tests pin the two things that
 * were dropping it: cookie Path must be a prefix of `/authorize` (WebKit
 * rejects a `/callback`-only path set on `/authorize`), and callback can still
 * take the verifier from the nonce-keyed store when the cookie is absent.
 */

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_EDITION = "onprem-slim";
  process.env.SECRET_ENCRYPTION_KEY = "test-oauth-state-secret";
  process.env.OAUTH_STATE_SECRET = "test-oauth-state-secret";
});

const USER = "user-1";
const ORG = "org-1";
const PROJECT = "proj-1";

const exchangeCode = vi.fn(async () => {
  throw new Error("exchange-reached");
});

vi.mock("@onecli/db", () => ({
  Prisma: {},
  db: {
    apiKey: { findUnique: async () => null },
    user: {
      findUnique: async ({ select }: { select?: Record<string, unknown> }) =>
        select?.organizationMemberships
          ? { organizationMemberships: [{ organizationId: ORG }] }
          : { id: USER, email: "admin@localhost" },
    },
    organizationMember: {
      findFirst: async () => ({ organizationId: ORG }),
    },
    project: {
      findFirst: async ({ where }: { where: { id?: string } }) =>
        where?.id
          ? { id: where.id, organizationId: ORG, createdByUserId: USER }
          : { id: PROJECT, organizationId: ORG },
      findUnique: async () => ({ organizationId: ORG }),
    },
  },
}));

vi.mock("../apps/resolve-credentials", () => ({
  resolveAppCredentials: async () => ({
    values: { clientId: "client", clientSecret: "secret" },
    source: "env",
  }),
}));

vi.mock("../apps/registry", () => ({
  getApp: (id: string) =>
    id === "pkceapp"
      ? {
          id,
          name: "PKCE App",
          available: true,
          connectionMethod: {
            type: "oauth",
            requiresPkce: true,
            defaultScopes: ["read"],
            buildAuthUrl: ({
              redirectUri,
              state,
              codeChallenge,
              codeChallengeMethod,
            }: {
              redirectUri: string;
              state: string;
              codeChallenge?: string;
              codeChallengeMethod?: string;
            }) => {
              const url = new URL("https://idp.example.com/authorize");
              url.searchParams.set("redirect_uri", redirectUri);
              url.searchParams.set("state", state);
              if (codeChallenge) {
                url.searchParams.set("code_challenge", codeChallenge);
              }
              if (codeChallengeMethod) {
                url.searchParams.set(
                  "code_challenge_method",
                  codeChallengeMethod,
                );
              }
              return url.toString();
            },
            exchangeCode,
          },
        }
      : undefined,
  getApps: () => [],
}));

import { createApiApp } from "../app";
import { generateNonce, signOAuthState } from "../lib/oauth-state";
import { rememberPkceVerifier, takePkceVerifier } from "../lib/oauth-pkce";

const setCookieHeaders = (res: Response) => {
  const getSetCookie = res.headers.getSetCookie?.bind(res.headers);
  if (getSetCookie) return getSetCookie();
  const single = res.headers.get("set-cookie");
  return single ? [single] : [];
};

const cookieNamed = (headers: string[], name: string) =>
  headers.find((header) => header.startsWith(`${name}=`));

describe("oauth PKCE cookie + verifier store", () => {
  let app: Hono<ApiEnv>;

  beforeAll(() => {
    app = createApiApp({
      getSession: async () => ({ id: "local-admin", email: "admin@localhost" }),
    });
  });

  afterEach(() => {
    exchangeCode.mockClear();
    takePkceVerifier("store-nonce");
  });

  const origAppUrl = process.env.APP_URL;
  afterEach(() => {
    if (origAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = origAppUrl;
  });

  it("sets the PKCE cookie on a path that is a prefix of /authorize", async () => {
    delete process.env.APP_URL;

    const res = await app.request(
      `/v1/apps/pkceapp/authorize?_project=${PROJECT}`,
      {
        headers: { host: "localhost:10254" },
      },
    );

    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("code_challenge=");
    expect(location).toContain("code_challenge_method=S256");

    const pkce = cookieNamed(
      setCookieHeaders(res),
      "onecli_oauth_code_verifier",
    );
    expect(pkce).toBeDefined();
    expect(pkce).toContain("Path=/v1/apps/pkceapp");
    expect(pkce).not.toContain("Path=/v1/apps/pkceapp/callback");
    expect(pkce).not.toMatch(/(?:^|; )Secure(?:;|$)/);
  });

  it("recovers the verifier from the nonce store when the cookie is missing", async () => {
    delete process.env.APP_URL;
    const nonce = "store-nonce";
    rememberPkceVerifier(nonce, "stored-verifier");
    const state = signOAuthState({
      projectId: PROJECT,
      provider: "pkceapp",
      nonce,
      origin: "http://localhost:10254",
    });

    const res = await app.request(
      `/v1/apps/pkceapp/callback?state=${encodeURIComponent(state)}&code=auth-code`,
      { headers: { host: "localhost:10254" } },
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("exchange-reached");
    expect(res.headers.get("location")).not.toContain("Missing%20PKCE%20verifier");
    expect(exchangeCode).toHaveBeenCalledWith(
      expect.objectContaining({ codeVerifier: "stored-verifier" }),
    );
  });

  it("still errors when neither cookie nor store has a verifier", async () => {
    delete process.env.APP_URL;
    const state = signOAuthState({
      projectId: PROJECT,
      provider: "pkceapp",
      nonce: generateNonce(),
      origin: "http://localhost:10254",
    });

    const res = await app.request(
      `/v1/apps/pkceapp/callback?state=${encodeURIComponent(state)}&code=auth-code`,
      { headers: { host: "localhost:10254" } },
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("Missing%20PKCE%20verifier");
    expect(exchangeCode).not.toHaveBeenCalled();
  });
});
