/**
 * Parse a Home Assistant base URL for connection metadata (display name + gateway host match).
 */
export const parseHomeAssistantServerUrl = (
  raw: string,
): { name: string; haHost: string } | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withScheme = /^[a-zA-Z][a-zA-Z+.-]*:\/\//.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(withScheme);
    const hostname = url.hostname.replace(/\.$/, "").toLowerCase();
    if (!hostname) return null;
    return { name: hostname, haHost: hostname };
  } catch {
    return null;
  }
};

/** Normalize base URL for HASS_SERVER (trim, no trailing slash on path root). */
export const normalizeHassServerUrl = (raw: string): string => {
  const trimmed = raw.trim().replace(/\/+$/, "");
  return trimmed || raw.trim();
};
