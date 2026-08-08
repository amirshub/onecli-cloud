---
name: homeassistant-container-onecli-ashub
description: >-
  OneCLI container workflow for Home Assistant using hass-cli. Use when the user
  wants to manage Home Assistant from inside an agent/container using HASS_SERVER
  and HASS_TOKEN (provided by OneCLI container-config), validate config, reload
  vs restart, inspect logs, and iterate safely. Inspired by komal-SkyNET/claude-skill-homeassistant.
disable-model-invocation: true
---

# Home Assistant container workflow (OneCLI + hass-cli)

This skill is for **operating Home Assistant from inside a OneCLI agent container** using `hass-cli`.

It assumes the platform provides these env vars (via OneCLI `container-config`):

- `HASS_SERVER` (base URL, e.g. `https://asmarthub10.tail2b4838.ts.net`)
- `HASS_TOKEN` (long-lived access token)

Reference skill that inspired the workflow: [`komal-SkyNET/claude-skill-homeassistant`](https://github.com/komal-SkyNET/claude-skill-homeassistant)

## Preconditions checklist

1. Confirm env exists (do not print tokens):

```bash
echo "HASS_SERVER=$HASS_SERVER"
test -n "$HASS_TOKEN" && echo "HASS_TOKEN=set" || echo "HASS_TOKEN=missing"
```

2. Confirm `hass-cli` is installed:

```bash
hass-cli --help
```

If missing, install it in the container (prefer `pipx` when available; otherwise `pip`):

```bash
pipx install homeassistant-cli || python -m pip install --user homeassistant-cli
```

## Core commands (safe defaults)

### Connectivity + basic inspection

```bash
hass-cli config
hass-cli state list --limit 20
```

### Trigger an automation / run a service

Prefer `service call` with explicit JSON so it’s reproducible:

```bash
hass-cli service call light.turn_on --data '{"entity_id":"light.living_room"}'
```

### Logs for debugging

Use the log commands available in your HA setup; if `hass-cli` can’t access add-ons/supervisor logs (common), fall back to HA’s built-in logs endpoints via `hass-cli raw`:

```bash
hass-cli raw get /api/error_log
```

## Change management workflow (reload vs restart)

Use this decision rule (optimized for minimal downtime):

- **Dashboards/UI-only changes**: no restart; browser refresh usually enough.
- **Automation/script changes**: `reload` automations/scripts.
- **Core config changes** (`configuration.yaml`, integrations setup): validate then restart (or reload if HA supports it for that domain).

### Validate first (always)

Use the HA config check endpoint; prefer `hass-cli raw` because it works even when higher-level helpers are absent:

```bash
hass-cli raw post /api/config/core/check_config
```

Only proceed if validation is OK.

### Reload (preferred)

Examples:

```bash
hass-cli service call homeassistant.reload_all
```

Or target a specific domain if you know it (varies by HA version / config):

```bash
hass-cli service call automation.reload
```

### Restart (when required)

```bash
hass-cli service call homeassistant.restart
```

After a restart, verify:

```bash
hass-cli config
hass-cli state get sensor.time || true
```

## Iteration protocol (fast + safe)

When the user asks for a change (automation, script, dashboard):

1. Make the smallest possible change.
2. Validate (`/api/config/core/check_config`).
3. Reload if possible; restart only if required.
4. Trigger the automation/service manually.
5. Inspect error logs (`/api/error_log`) if behavior doesn’t match expectations.
6. Repeat until clean.

## Security rules

- Never echo or print `HASS_TOKEN`.
- Never store tokens in files unless the user explicitly requests it.
- When sharing commands back to the user, use `HASS_TOKEN=set` or `***` placeholders.

## Troubleshooting quick hits

- **401 / forbidden**: token missing/invalid; verify `HASS_TOKEN` set and that it is a long-lived token from the correct HA instance (`HASS_SERVER`).
- **Connection fails**: verify `HASS_SERVER` includes scheme (`https://...`) and the container can reach it (DNS / routing).
- **Works for one host, not another**: ensure you’re in the right OneCLI connection (each HA host has its own connection identity; `HASS_SERVER` should match the target host).
