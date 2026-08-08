---
name: bedrock-onecli-ashub
description: >-
  Amazon Bedrock on OneCLI: api_key app connection (apiKey, region, optional
  nickname as metadata.name, optional default Claude model IDs), container-config env (CLAUDE_CODE_USE_BEDROCK,
  AWS_BEARER_TOKEN_BEDROCK, AWS_REGION, ANTHROPIC_DEFAULT_*), gateway Bearer
  injection on bedrock-runtime hosts, agent grants to attach a Bedrock connection
  to an agent when multiple apply, with x-onecli-connection-id still overriding
  per request. No Anthropic-vs-Bedrock connect guard.
disable-model-invocation: true
---

# Amazon Bedrock on OneCLI

Use this skill when implementing or debugging **Bedrock as an app connection** (provider id `bedrock`), **agent container LLM env**, or **gateway auth** for Bedrock Runtime.

## Container env contract

When a connected Bedrock `AppConnection` applies for the agent (see [`packages/api/src/routes/container-config.ts`](packages/api/src/routes/container-config.ts)), the response `env` includes **only** the Bedrock-related auth block (no `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` placeholders):

| Variable                         | Value                                                         |
| -------------------------------- | ------------------------------------------------------------- |
| `CLAUDE_CODE_USE_BEDROCK`        | `1`                                                           |
| `AWS_BEARER_TOKEN_BEDROCK`       | `placeholder` (gateway replaces on outbound Bedrock requests) |
| `AWS_REGION`                     | From stored connection field `region`                         |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Optional; only if non-empty in stored credentials             |
| `ANTHROPIC_DEFAULT_OPUS_MODEL`   | Optional; only if non-empty                                   |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL`  | Optional; only if non-empty                                   |

Otherwise the route keeps the existing Anthropic-secret-based placeholders.

**Eligibility:** only Bedrock connections the agent can inject (policy/grants). If several eligible connections exist, newest by `updatedAt` wins for container env.

## Multiple Bedrock connections

- **Attach via agent grants:** grant (attach) the desired Bedrock `AppConnection` to the agent so it is injectable. Prefer attaching a single Bedrock connection per agent when you need a specific region/key.
- **Gateway:** Disambiguation for app injection (see [`apps/gateway/src/connect.rs`](apps/gateway/src/connect.rs)):
  1. Request header [`x-onecli-connection-id`](apps/gateway/src/connect.rs) (`CONNECTION_ID_HEADER`) if present.
  2. Else existing behavior (single match, or ambiguous response listing choices).

## Gateway

[`apps/gateway/src/apps.rs`](apps/gateway/src/apps.rs) registers provider `bedrock` with `HostPattern::AwsBedrockRuntime`: hostnames must look like `bedrock-runtime.<region>.amazonaws.com` (starts with `bedrock-runtime.`, ends with `.amazonaws.com`). Decrypted credentials must include `access_token` (Bedrock API key); the gateway sets `Authorization: Bearer <access_token>` on matching requests.

## App definition checklist

- [`packages/api/src/apps/bedrock.ts`](packages/api/src/apps/bedrock.ts) — `AppDefinition` (`apiKey`, `region`, optional `nickname` → `metadata.name` / `label` via `extractLabel`, optional model fields; mark nickname + model fields with `optional: true` on the field defs).
- [`packages/api/src/apps/types.ts`](packages/api/src/apps/types.ts) — field defs support `optional: true` when needed.
- [`packages/api/src/apps/registry.ts`](packages/api/src/apps/registry.ts) — register `bedrock`.
- [`packages/api/src/apps/connect-credentials.ts`](packages/api/src/apps/connect-credentials.ts) + connect in [`packages/api/src/routes/apps.ts`](packages/api/src/routes/apps.ts) — `api_key` credentials include `access_token` plus other submitted non-empty fields (nickname is metadata-only).
- [`packages/api/src/routes/container-config.ts`](packages/api/src/routes/container-config.ts) — Bedrock branch as above (eligible connection, newest-by-`updatedAt` fallback).
- [`packages/api/src/routes/grants.ts`](packages/api/src/routes/grants.ts) — attach/detach connections on agents.
- [`apps/web/public/icons/bedrock.svg`](apps/web/public/icons/bedrock.svg)

## AWS reference

- [Use API keys in Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys-use.html)

## Verification

- `pnpm check`
- Connect Bedrock with region + API key → `GET /api/container-config` shows Bedrock env without Anthropic placeholders.
- With multiple Bedrock connections, attach the intended one to the agent → `GET /api/container-config?agent=…` reflects that connection’s `region` / optional model env; gateway traffic to `bedrock-runtime.<region>.amazonaws.com` injects that key without sending `x-onecli-connection-id`; sending the header still overrides per request.
