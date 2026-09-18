import { createHash, randomBytes } from "crypto";

/** HttpOnly cookie holding the PKCE verifier between authorize redirect and callback. */
export const OAUTH_PKCE_COOKIE_NAME = "onecli_oauth_code_verifier";

const PKCE_TTL_MS = 600_000;

type PkceEntry = { verifier: string; expiresAt: number };

const pkceByNonce = new Map<string, PkceEntry>();

/**
 * Path for OAuth bounce cookies (`oauth_state`, PKCE verifier).
 *
 * Must be a prefix of both `/authorize` (where they are set) and `/callback`
 * (where they are read). A `/callback`-only path is rejected by WebKit/Safari
 * when Set-Cookie arrives on `/authorize`, which is what produced
 * "Missing PKCE verifier" after Airtable redirected back.
 */
export const oauthFlowCookiePath = (provider: string) =>
  `/v1/apps/${provider}`;

export const oauthCookieSecure = (request: Request): boolean => {
  const forwarded = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  if (forwarded === "https") return true;
  if (forwarded === "http") return false;
  return new URL(request.url).protocol === "https:";
};

export const oauthFlowCookieOptions = (provider: string, request: Request) => ({
  httpOnly: true as const,
  secure: oauthCookieSecure(request),
  sameSite: "Lax" as const,
  path: oauthFlowCookiePath(provider),
  maxAge: 600,
});

const pruneExpiredPkce = (now = Date.now()) => {
  for (const [nonce, entry] of pkceByNonce) {
    if (entry.expiresAt <= now) pkceByNonce.delete(nonce);
  }
};

/**
 * Same-process fallback when the PKCE cookie is dropped (bounce-tracking,
 * WebKit path rules). Keyed by the OAuth state nonce, not the verifier itself.
 */
export const rememberPkceVerifier = (nonce: string, verifier: string) => {
  pruneExpiredPkce();
  pkceByNonce.set(nonce, {
    verifier,
    expiresAt: Date.now() + PKCE_TTL_MS,
  });
};

/** Single-use: removes the nonce even when the entry has expired. */
export const takePkceVerifier = (nonce: string): string | undefined => {
  const entry = pkceByNonce.get(nonce);
  if (!entry) return undefined;
  pkceByNonce.delete(nonce);
  if (entry.expiresAt <= Date.now()) return undefined;
  return entry.verifier;
};

/**
 * RFC 7636 S256 PKCE pair. Verifier length is 43 chars (32 random bytes, base64url).
 */
export const generatePkcePair = (): {
  codeVerifier: string;
  codeChallenge: string;
} => {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
};
