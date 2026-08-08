import type { AppDefinition } from "./types";
import { parseHomeAssistantServerUrl } from "../lib/home-assistant-url";

export const homeAssistant: AppDefinition = {
  id: "home-assistant",
  name: "Home Assistant",
  icon: "/icons/home-assistant.svg",
  description:
    "Control your Home Assistant instance using a long-lived access token and base URL.",
  connectionMethod: {
    type: "api_key",
    fields: [
      {
        name: "token",
        label: "Long-lived access token",
        description:
          "Create a long-lived token in your HA profile (profile → security).",
        placeholder: "Access token…",
      },
      {
        name: "serverUrl",
        label: "Home Assistant URL",
        description:
          "Full URL of your instance (e.g. https://homeassistant.local:8123 or https://example.ts.net).",
        placeholder: "https://homeassistant.local:8123",
        secret: false,
      },
    ],
    resolveMetadata: async (fields) => {
      const parsed = parseHomeAssistantServerUrl(fields.serverUrl ?? "");
      if (!parsed) {
        throw new Error("Invalid Home Assistant URL");
      }
      return { name: parsed.name, haHost: parsed.haHost };
    },
  },
  labelHint: 'e.g. "homeassistant.local"',
  available: true,
};
