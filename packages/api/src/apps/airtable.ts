import type { AppDefinition } from "./types";

const OAUTH_AUTHORIZE = "https://airtable.com/oauth2/v1/authorize";
const OAUTH_TOKEN = "https://airtable.com/oauth2/v1/token";
const WHOAMI = "https://api.airtable.com/v0/meta/whoami";

/** RFC 7617 / Airtable oauth-example: standard Base64, not base64url. */
const basicAuthHeader = (clientId: string, clientSecret: string) => {
  const raw = `${clientId.trim()}:${clientSecret.trim()}`;
  const encoded = Buffer.from(raw, "utf8").toString("base64");
  return `Basic ${encoded}`;
};

export const airtable: AppDefinition = {
  id: "airtable",
  name: "Airtable",
  icon: "/icons/airtable.svg",
  description: "Bases, tables, and records via the Airtable API.",
  connectionMethod: {
    type: "oauth",
    requiresPkce: true,
    defaultScopes: [
      "data.records:read",
      "data.records:write",
      "schema.bases:read",
      "user.email:read",
    ],
    permissions: [
      {
        scope: "data.records:read",
        name: "Read records",
        description: "List and read records in bases you grant access to",
        access: "read",
      },
      {
        scope: "data.records:write",
        name: "Write records",
        description: "Create, update, and delete records",
        access: "write",
      },
      {
        scope: "schema.bases:read",
        name: "Read schema",
        description: "List bases and read table/field structure",
        access: "read",
      },
      {
        scope: "user.email:read",
        name: "Email",
        description: "See your email for connection labeling",
        access: "read",
      },
    ],
    buildAuthUrl: ({
      appCredentials,
      redirectUri,
      scopes,
      state,
      codeChallenge,
      codeChallengeMethod,
    }) => {
      if (!codeChallenge || codeChallengeMethod !== "S256") {
        throw new Error("Airtable OAuth requires PKCE (S256 code challenge)");
      }
      const url = new URL(OAUTH_AUTHORIZE);
      url.searchParams.set("client_id", appCredentials.clientId!);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", scopes.join(" "));
      url.searchParams.set("state", state);
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
      return url.toString();
    },
    exchangeCode: async ({
      appCredentials,
      callbackParams,
      redirectUri,
      codeVerifier,
    }) => {
      if (!codeVerifier) {
        throw new Error("Airtable token exchange requires PKCE code_verifier");
      }
      if (callbackParams.error) {
        throw new Error(
          `Airtable authorization error: ${callbackParams.error} — ${callbackParams.error_description ?? "no description"}`,
        );
      }
      if (!callbackParams.code) {
        throw new Error("Airtable callback missing authorization code");
      }

      const tokenRes = await fetch(OAUTH_TOKEN, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: basicAuthHeader(
            appCredentials.clientId!,
            appCredentials.clientSecret!,
          ),
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: appCredentials.clientId!.trim(),
          code: callbackParams.code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
      });

      if (!tokenRes.ok) {
        let detail = `${tokenRes.status} ${tokenRes.statusText}`;
        try {
          const errBody = (await tokenRes.json()) as {
            error?: string;
            error_description?: string;
          };
          if (errBody.error_description) {
            detail = `${detail}: ${errBody.error_description}`;
          } else if (errBody.error) {
            detail = `${detail}: ${errBody.error}`;
          }
        } catch {
          // ignore JSON parse errors
        }
        throw new Error(`Airtable token exchange failed: ${detail}`);
      }

      const tokenData = (await tokenRes.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        token_type?: string;
        scope?: string;
        error?: string;
        error_description?: string;
      };

      if (tokenData.error || !tokenData.access_token) {
        throw new Error(
          tokenData.error_description ?? "Failed to exchange code for token",
        );
      }

      const expiresAt = tokenData.expires_in
        ? Math.floor(Date.now() / 1000) + tokenData.expires_in
        : undefined;

      const credentials: Record<string, unknown> = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_type: tokenData.token_type?.trim() ?? "Bearer",
        expires_at: expiresAt,
      };

      const scopes = tokenData.scope?.split(/\s+/).filter(Boolean) ?? [];

      let metadata: Record<string, unknown> | undefined;
      const userRes = await fetch(WHOAMI, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });

      if (userRes.ok) {
        const who = (await userRes.json()) as {
          id?: string;
          email?: string;
        };
        if (who.id || who.email) {
          metadata = {};
          if (typeof who.email === "string" && who.email) {
            metadata.email = who.email;
          }
          if (typeof who.id === "string" && who.id) {
            metadata.username = who.id;
          }
        }
      }

      return { credentials, scopes, metadata };
    },
  },
  available: true,
  configurable: {
    fields: [
      {
        name: "clientId",
        label: "Client ID",
        placeholder: "your-airtable-oauth-client-id",
      },
      {
        name: "clientSecret",
        label: "Client Secret",
        placeholder: "your-airtable-oauth-client-secret",
        secret: true,
      },
    ],
    envDefaults: {
      clientId: "AIRTABLE_CLIENT_ID",
      clientSecret: "AIRTABLE_CLIENT_SECRET",
    },
  },
};
