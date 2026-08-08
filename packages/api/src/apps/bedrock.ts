import type { AppDefinition } from "./types";

export const bedrock: AppDefinition = {
  id: "bedrock",
  name: "Amazon Bedrock",
  icon: "/icons/bedrock.svg",
  description:
    "Run Claude via Amazon Bedrock using a Bedrock API key and AWS region.",
  connectionMethod: {
    type: "api_key",
    fields: [
      {
        name: "apiKey",
        label: "Bedrock API key",
        description:
          "Create an API key in the Amazon Bedrock console (API keys for Bedrock).",
        placeholder: "Bedrock API key…",
      },
      {
        name: "region",
        label: "AWS region",
        description: "Region where you use Bedrock (e.g. us-east-1).",
        placeholder: "us-east-1",
        secret: false,
      },
      {
        name: "nickname",
        label: "Nickname (optional)",
        description:
          "Shown in the dashboard to tell multiple Bedrock connections apart.",
        placeholder: "e.g. Production, Team A",
        optional: true,
        secret: false,
      },
      {
        name: "anthropicDefaultSonnetModel",
        label: "Default Sonnet model ID (optional)",
        description:
          "Optional Bedrock model ID for Sonnet (e.g. anthropic.claude-3-5-sonnet-20241022-v2:0).",
        placeholder: "Leave blank to use Claude Code defaults",
        optional: true,
        secret: false,
      },
      {
        name: "anthropicDefaultOpusModel",
        label: "Default Opus model ID (optional)",
        description: "Optional Bedrock model ID for Opus.",
        placeholder: "Leave blank to use Claude Code defaults",
        optional: true,
        secret: false,
      },
      {
        name: "anthropicDefaultHaikuModel",
        label: "Default Haiku model ID (optional)",
        description: "Optional Bedrock model ID for Haiku.",
        placeholder: "Leave blank to use Claude Code defaults",
        optional: true,
        secret: false,
      },
    ],
    resolveMetadata: async (fields) => {
      const nickname = fields.nickname?.trim();
      if (nickname) {
        if (nickname.length > 120) {
          throw new Error("Nickname must be at most 120 characters");
        }
        return { name: nickname };
      }
      const region = fields.region?.trim();
      return { name: region ? `Bedrock (${region})` : "Amazon Bedrock" };
    },
  },
  labelHint: 'e.g. "Production", "us-east-1"',
  available: true,
};
