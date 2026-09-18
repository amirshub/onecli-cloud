import { createHash } from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generatePkcePair,
  oauthCookieSecure,
  oauthFlowCookieOptions,
  oauthFlowCookiePath,
  rememberPkceVerifier,
  takePkceVerifier,
} from "./oauth-pkce";

describe("oauthFlowCookiePath", () => {
  it("is a prefix of both authorize and callback so WebKit will store the cookie", () => {
    const path = oauthFlowCookiePath("airtable");
    expect(path).toBe("/v1/apps/airtable");
    expect("/v1/apps/airtable/authorize".startsWith(`${path}/`)).toBe(true);
    expect("/v1/apps/airtable/callback".startsWith(`${path}/`)).toBe(true);
  });
});

describe("oauthCookieSecure", () => {
  it("follows x-forwarded-proto, not NODE_ENV", () => {
    expect(
      oauthCookieSecure(
        new Request("http://localhost:10254/v1/apps/airtable/authorize", {
          headers: { "x-forwarded-proto": "https" },
        }),
      ),
    ).toBe(true);
    expect(
      oauthCookieSecure(
        new Request("https://example.com/v1/apps/airtable/authorize", {
          headers: { "x-forwarded-proto": "http" },
        }),
      ),
    ).toBe(false);
  });

  it("falls back to the request URL scheme", () => {
    expect(
      oauthCookieSecure(
        new Request("http://localhost:10254/v1/apps/airtable/authorize"),
      ),
    ).toBe(false);
    expect(
      oauthCookieSecure(
        new Request("https://onecli.example.com/v1/apps/airtable/authorize"),
      ),
    ).toBe(true);
  });
});

describe("oauthFlowCookieOptions", () => {
  it("sets SameSite=Lax on the provider path without Secure on http", () => {
    const request = new Request(
      "http://localhost:10254/v1/apps/airtable/authorize",
    );
    expect(oauthFlowCookieOptions("airtable", request)).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
      path: "/v1/apps/airtable",
      maxAge: 600,
    });
  });
});

describe("generatePkcePair", () => {
  it("returns an S256 challenge of the verifier", () => {
    const { codeVerifier, codeChallenge } = generatePkcePair();
    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(codeChallenge).toBe(
      createHash("sha256").update(codeVerifier).digest("base64url"),
    );
  });
});

describe("pkce verifier store", () => {
  afterEach(() => {
    takePkceVerifier("n1");
    takePkceVerifier("n2");
  });

  it("is single-use", () => {
    rememberPkceVerifier("n1", "verifier-one");
    expect(takePkceVerifier("n1")).toBe("verifier-one");
    expect(takePkceVerifier("n1")).toBeUndefined();
  });

  it("returns nothing for an unknown nonce", () => {
    expect(takePkceVerifier("missing")).toBeUndefined();
  });

  it("drops expired entries", () => {
    vi.useFakeTimers();
    rememberPkceVerifier("n2", "stale");
    vi.advanceTimersByTime(600_001);
    expect(takePkceVerifier("n2")).toBeUndefined();
    vi.useRealTimers();
  });
});
