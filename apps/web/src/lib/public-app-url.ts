import { headers } from "next/headers";
import {
  configuredAppUrl,
  originFromHeaders,
} from "@onecli/api/lib/app-origin";
import { APP_URL } from "@/lib/env";

/**
 * Public origin used for OAuth redirect URIs and the Settings → Instance card.
 *
 * Matches `getRequestOrigin` in `@onecli/api`: an explicit `APP_URL` always
 * wins, otherwise the incoming Host / X-Forwarded-Host.
 */
export const resolvePublicAppUrl = async (): Promise<{
  appUrl: string;
  autoDetected: boolean;
}> => {
  const configured = configuredAppUrl();
  if (configured) return { appUrl: configured, autoDetected: false };

  const detected = originFromHeaders(await headers());
  return { appUrl: detected ?? APP_URL, autoDetected: true };
};
