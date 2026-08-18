"use client";

// Alias key on purpose — in EE builds this whole module is aliased away, so
// this import only ever resolves here in the flat editions, where it is the
// SHARED registry (configs without picker dialogs).
import { granularAccessConfigs } from "@/lib/granular-access";
import type { Connection } from "@/lib/api";
import { GoogleDriveFolderScope } from "@/lib/policy-editor/google-drive-folder-scope";

/**
 * The OSS resource-scope seam (step 9.5): GitHub repositories / Dropbox folders
 * stay Cloud-only (no OSS guard). ASHUB Google Drive `driveFolders` is enforced
 * by this gateway, so the folder picker is live here. The EE editions alias
 * this file to `@/ee/policy-editor/resource-scope` (the real fields).
 */

export interface ResourceScopeFieldsProps {
  connection: Connection;
  policy: Record<string, unknown> | null;
  onChange: (policy: Record<string, unknown> | null) => void;
  /** Read-only contexts never show an upsell hint. */
  readOnly?: boolean;
  /** Accepted for prop parity with the EE editor; OSS has no org scope, so
   * there is never a boundary to narrow within. */
  orgPolicy?: Record<string, unknown> | null;
}

export const ResourceScopeFields: (
  props: ResourceScopeFieldsProps,
) => React.JSX.Element | null = (props) => {
  const { connection, readOnly = false } = props;
  if (connection.provider === "google-drive") {
    return <GoogleDriveFolderScope {...props} />;
  }
  const meta = (connection.metadata as Record<string, unknown> | null) ?? {};
  const config = granularAccessConfigs.get(connection.provider);
  if (!config?.isSupported(meta) || readOnly) return null;
  return (
    <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs">
      Resource scoping (limit this connection to specific repositories or
      folders) is available on OneCLI Cloud.
    </p>
  );
};
