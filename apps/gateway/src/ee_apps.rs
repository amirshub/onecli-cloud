//! Cloud app providers (OSS stub — returns an empty slice).

use crate::apps::AppProvider;

/// Returns cloud app provider definitions (supplied by the EE builds).
pub(crate) fn providers() -> &'static [AppProvider] {
    &[]
}

/// Attempt to refresh credentials for an EE-managed cloud-app credential type.
/// Returns `None` if the credential type is not recognized (falls through to standard refresh).
pub(crate) async fn try_refresh_credentials(
    _cred_type: &str,
    _creds: &serde_json::Value,
    _session_policy: Option<&serde_json::Value>,
) -> Option<anyhow::Result<(String, i64)>> {
    None
}

/// Narrow a connection's selected scope to the organization's boundary. OSS
/// stores no boundaries, so the selection stands unchanged.
pub(crate) fn compose_resource_scope(
    _boundary: Option<&serde_json::Value>,
    selected: Option<&serde_json::Value>,
) -> Option<serde_json::Value> {
    selected.cloned()
}

/// Whether a resource scope reaches NOTHING. Empty `driveFolders` is deny-all
/// (the same sentinel EE uses for empty repo/folder lists). GitHub/Dropbox
/// scopes are not enforced on OSS and are never attached by inject-select.
pub(crate) fn scope_reaches_nothing(policy: Option<&serde_json::Value>) -> bool {
    policy
        .and_then(|p| p.get("driveFolders"))
        .and_then(|v| v.as_array())
        .is_some_and(|a| a.is_empty())
}

/// Whether this provider enforces a resource scope per REQUEST. OSS enforces
/// `google-drive` `driveFolders` in `drive_folder_guard` (the stored token is
/// account-wide; the guard restricts each call). GitHub/Dropbox stay Cloud-only.
pub(crate) fn has_request_guard(provider: &str) -> bool {
    provider == "google-drive"
}

/// Whether this credential type mints a RESOURCE-SCOPED credential from the
/// provider (e.g. a GitHub installation token limited to specific repos).
/// Such a credential is minted live per request and never persisted, so the
/// caller defers it until the request is known to be allowed. OSS scopes no
/// credentials, so it never defers.
pub(crate) fn has_token_scoper(_cred_type: &str) -> bool {
    false
}
