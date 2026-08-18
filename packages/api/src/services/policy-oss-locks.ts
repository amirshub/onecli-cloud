/**
 * The OSS edition's policy locks (step 9.5): shared implementations wired ONLY
 * through the OSS init seam (`apps/web/src/lib/init/api.ts`, aliased away by
 * every EE edition). The provider-hook DEFAULTS stay permissive — cloud's
 * in-process web app relies on them before its init warms — so the locks are
 * wired, not defaulted.
 */
import { ServiceError } from "./errors";
import type { PolicyValidator } from "../providers";
import { getApp } from "../apps/registry";

const isDriveFoldersPolicy = (
  provider: string,
  policy: Record<string, unknown>,
): boolean => {
  if (provider !== "google-drive") return false;
  const keys = Object.keys(policy);
  if (keys.length !== 1 || keys[0] !== "driveFolders") return false;
  const folders = policy.driveFolders;
  return (
    Array.isArray(folders) &&
    folders.every((f) => typeof f === "string" && f.length > 0)
  );
};

/**
 * OSS rejects GitHub/Dropbox granular scoping (no request/token guard in this
 * edition). `google-drive` `driveFolders` is allowed: the OSS gateway enforces
 * it per request. One seam covers both storage paths: `assertSessionPolicyValid`
 * (policy-rule create/update/publish) and the legacy equipment `sessionPolicy`
 * write both call `getPolicyValidator().validate(...)`.
 *
 * `validateTargets` (create/update only) rejects app targets naming a
 * cloud-only provider — the registry's EE stubs (`available: false`), which
 * the OSS gateway's base catalog can't resolve, so the rule would be dead.
 * The editor locks the same key visually; this is the belt for the CLI/API
 * path. App targets only: `assertTargetsValid` proves a connection target's
 * OWNERSHIP, not connectability — but no OSS flow can mint an EE-provider
 * connection in the first place (connect rejects `cloud_only` providers), so
 * connection targets need no provider check. Unknown provider strings stay
 * accepted (today's behavior).
 */
export const ossPolicyValidator: PolicyValidator = {
  validate: async (_organizationId, provider, _metadata, policy) => {
    if (isDriveFoldersPolicy(provider, policy)) return;
    throw new ServiceError(
      "UNPROCESSABLE",
      "Granular resource scoping (repositories/folders) is available on OneCLI Cloud.",
    );
  },
  validateTargets: async (targets) => {
    for (const t of targets) {
      if (t.kind !== "app") continue;
      const app = getApp(t.provider);
      if (app?.available === false) {
        throw new ServiceError(
          "UNPROCESSABLE",
          `${app.name} connections are available on OneCLI Cloud.`,
        );
      }
    }
  },
};
