import { createHash, randomBytes } from "crypto";

/** HttpOnly cookie holding the PKCE verifier between authorize redirect and callback. */
export const OAUTH_PKCE_COOKIE_NAME = "onecli_oauth_code_verifier";

export const oauthPkceCookiePath = (provider: string) =>
  `/v1/apps/${provider}/callback`;

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
