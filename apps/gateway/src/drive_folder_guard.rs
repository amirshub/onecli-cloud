//! OSS request-level folder allowlist for the `google-drive` provider.
//!
//! Google OAuth tokens cannot be scoped to a folder, so the stored credential
//! is injected as-is and this guard refuses calls that reach files outside the
//! grant's `driveFolders` IDs (the file itself, or an ancestor). Absent
//! `driveFolders` means unrestricted — the common case.

use std::collections::HashSet;

use http_body_util::{Either, Full};
use hyper::body::Bytes;
use hyper::header::HeaderValue;
use hyper::{HeaderMap, Response, StatusCode};
use percent_encoding::percent_decode_str;
use serde_json::Value;

use crate::gateway::hooks::ForwardResponseBody;

const MAX_ANCESTOR_HOPS: usize = 32;

/// Folder IDs from a session policy, or `None` when this request is unrestricted.
pub(crate) fn drive_folders(policy: Option<&Value>) -> Option<Vec<String>> {
    let folders = policy
        .and_then(|p| p.get("driveFolders"))
        .and_then(|v| v.as_array())?;
    Some(
        folders
            .iter()
            .filter_map(|v| v.as_str())
            .map(str::to_string)
            .collect(),
    )
}

pub(crate) fn is_google_drive_api_host(host: &str) -> bool {
    matches!(
        host,
        "www.googleapis.com"
            | "docs.googleapis.com"
            | "sheets.googleapis.com"
            | "slides.googleapis.com"
    )
}

fn path_only(path: &str) -> &str {
    path.split_once('?').map(|(p, _)| p).unwrap_or(path)
}

fn is_drive_path(host: &str, path: &str) -> bool {
    match host {
        "docs.googleapis.com" | "sheets.googleapis.com" | "slides.googleapis.com" => true,
        "www.googleapis.com" => {
            let p = path_only(path);
            p.starts_with("/drive/")
                || p.starts_with("/upload/drive/")
                || p.starts_with("/batch/drive/")
        }
        _ => false,
    }
}

/// Whether the guard needs the JSON body (creates / updates that name parents).
pub(crate) fn needs_body(host: &str, method: &str, path: &str) -> bool {
    if !is_drive_path(host, path) {
        return false;
    }
    matches!(method, "POST" | "PUT" | "PATCH")
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum DriveTarget {
    /// Metadata that does not name a file (About, generateIds).
    UnscopedMeta,
    /// Opaque batch API — refused when a folder allowlist is set.
    OpaqueBatch,
    /// `files.list` / search. `q` is the Drive query string, if any.
    List { q: Option<String> },
    /// Create (POST `/files`) — parents come from the JSON body.
    Create,
    /// A specific file / document / spreadsheet / presentation ID.
    File { id: String },
}

pub(crate) fn classify(host: &str, method: &str, path: &str) -> Option<DriveTarget> {
    if !is_google_drive_api_host(host) || !is_drive_path(host, path) {
        return None;
    }
    let p = path_only(path);
    if p.starts_with("/batch/drive/") {
        return Some(DriveTarget::OpaqueBatch);
    }
    if p == "/drive/v3/about"
        || p == "/drive/v3/files/generateIds"
        || p.starts_with("/drive/v3/about/")
    {
        return Some(DriveTarget::UnscopedMeta);
    }
    if p == "/drive/v3/files" || p == "/upload/drive/v3/files" {
        return Some(if method == "GET" {
            DriveTarget::List {
                q: query_param(path, "q"),
            }
        } else if method == "POST" {
            DriveTarget::Create
        } else {
            DriveTarget::List {
                q: query_param(path, "q"),
            }
        });
    }
    file_id_from_path(p).map(|id| DriveTarget::File { id })
}

fn file_id_from_path(path: &str) -> Option<String> {
    const PREFIXES: &[&str] = &[
        "/drive/v3/files/",
        "/upload/drive/v3/files/",
        "/v1/documents/",
        "/v4/spreadsheets/",
        "/v1/presentations/",
    ];
    for prefix in PREFIXES {
        if let Some(rest) = path.strip_prefix(prefix) {
            let id = rest.split(['/', '?', ':']).next().unwrap_or("");
            if id.is_empty() || id == "generateIds" {
                return None;
            }
            return Some(id.to_string());
        }
    }
    None
}

fn query_param(path: &str, key: &str) -> Option<String> {
    let query = path.split_once('?')?.1;
    for pair in query.split('&') {
        let (k, v) = pair.split_once('=')?;
        if k == key {
            return Some(percent_decode_str(v).decode_utf8().ok()?.into_owned());
        }
    }
    None
}

/// `'folderId' in parents` clauses in a Drive `q` parameter.
pub(crate) fn parent_ids_in_query(q: &str) -> Vec<String> {
    let mut ids = Vec::new();
    let mut rest = q;
    while let Some(start) = rest.find('\'') {
        rest = &rest[start + 1..];
        let Some(end) = rest.find('\'') else { break };
        let id = &rest[..end];
        let after = rest[end + 1..].trim_start();
        if after.to_ascii_lowercase().starts_with("in parents") && !id.is_empty() {
            ids.push(id.to_string());
        }
        rest = &rest[end + 1..];
    }
    ids
}

pub(crate) fn parents_from_body(body: Option<&[u8]>) -> Vec<String> {
    let Some(bytes) = body else { return Vec::new() };
    let Ok(value) = serde_json::from_slice::<Value>(bytes) else {
        return Vec::new();
    };
    value
        .get("parents")
        .and_then(|p| p.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

pub(crate) fn forbidden(message: &str) -> Response<ForwardResponseBody> {
    let body = serde_json::json!({
        "error": "folder_scope_denied",
        "message": message,
    })
    .to_string();
    let mut response = Response::new(Either::Left(Full::new(Bytes::from(body))));
    *response.status_mut() = StatusCode::FORBIDDEN;
    response
        .headers_mut()
        .insert("content-type", HeaderValue::from_static("application/json"));
    response
        .headers_mut()
        .insert("x-should-retry", HeaderValue::from_static("false"));
    response
}

pub(crate) fn bearer_token(headers: &HeaderMap) -> Option<String> {
    let value = headers.get("authorization")?.to_str().ok()?;
    let token = value
        .strip_prefix("Bearer ")
        .or_else(|| value.strip_prefix("bearer "))?;
    (!token.is_empty()).then(|| token.to_string())
}

/// Walk Drive `parents` until `file_id` or an ancestor is in `allowed`.
pub(crate) async fn file_in_allowed_tree(
    token: &str,
    file_id: &str,
    allowed: &HashSet<String>,
) -> Result<bool, String> {
    if allowed.contains(file_id) {
        return Ok(true);
    }
    let client = reqwest::Client::new();
    let mut queue = vec![file_id.to_string()];
    let mut seen = HashSet::new();
    let mut hops = 0;
    while let Some(id) = queue.pop() {
        if hops >= MAX_ANCESTOR_HOPS {
            break;
        }
        hops += 1;
        if allowed.contains(&id) {
            return Ok(true);
        }
        if !seen.insert(id.clone()) {
            continue;
        }
        match fetch_parents(&client, token, &id).await {
            Ok(parents) => queue.extend(parents),
            Err(e) => return Err(e),
        }
    }
    Ok(false)
}

async fn fetch_parents(
    client: &reqwest::Client,
    token: &str,
    file_id: &str,
) -> Result<Vec<String>, String> {
    let url = format!(
        "https://www.googleapis.com/drive/v3/files/{file_id}?fields=id,parents&supportsAllDrives=true"
    );
    let res = client
        .get(url)
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Drive files.get returned {}", res.status()));
    }
    let value: Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(value
        .get("parents")
        .and_then(|p| p.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default())
}

pub(crate) async fn enforce(
    host: &str,
    method: &str,
    path: &str,
    headers: &HeaderMap,
    body: Option<&[u8]>,
    allowed_folders: &[String],
) -> Option<Response<ForwardResponseBody>> {
    let allowed: HashSet<String> = allowed_folders.iter().cloned().collect();
    if allowed.is_empty() {
        return Some(forbidden(
            "This Google Drive connection is limited to no folders.",
        ));
    }
    let Some(target) = classify(host, method, path) else {
        return None;
    };
    match target {
        DriveTarget::UnscopedMeta => None,
        DriveTarget::OpaqueBatch => Some(forbidden(
            "Batch Drive API calls are blocked when this connection is limited to specific folders.",
        )),
        DriveTarget::List { q } => {
            let Some(q) = q else {
                return Some(forbidden(
                    "Listing Google Drive files requires a parent folder in the allowed set (q=\"'FOLDER_ID' in parents\").",
                ));
            };
            let parent_ids = parent_ids_in_query(&q);
            if parent_ids.is_empty() {
                return Some(forbidden(
                    "Listing Google Drive files requires a parent folder in the allowed set.",
                ));
            }
            let token = match bearer_token(headers) {
                Some(t) => t,
                None => {
                    return Some(forbidden(
                        "Cannot verify folder scope without an access token.",
                    ));
                }
            };
            for parent in parent_ids {
                match file_in_allowed_tree(&token, &parent, &allowed).await {
                    Ok(true) => return None,
                    Ok(false) => {}
                    Err(e) => {
                        tracing::warn!(error = %e, "drive folder guard: parent lookup failed");
                        return Some(forbidden(
                            "Could not verify this Google Drive folder against the allowlist.",
                        ));
                    }
                }
            }
            Some(forbidden(
                "This list query is outside the folders allowed for this connection.",
            ))
        }
        DriveTarget::Create => {
            let parents = parents_from_body(body);
            if parents.is_empty() {
                return Some(forbidden(
                    "Creating a file requires a parent folder in the allowed set.",
                ));
            }
            let token = match bearer_token(headers) {
                Some(t) => t,
                None => {
                    return Some(forbidden(
                        "Cannot verify folder scope without an access token.",
                    ));
                }
            };
            for parent in parents {
                match file_in_allowed_tree(&token, &parent, &allowed).await {
                    Ok(true) => return None,
                    Ok(false) => {}
                    Err(e) => {
                        tracing::warn!(error = %e, "drive folder guard: parent lookup failed");
                        return Some(forbidden(
                            "Could not verify this Google Drive folder against the allowlist.",
                        ));
                    }
                }
            }
            Some(forbidden(
                "New files must be created inside a folder allowed for this connection.",
            ))
        }
        DriveTarget::File { id } => {
            if allowed.contains(&id) {
                return None;
            }
            let token = match bearer_token(headers) {
                Some(t) => t,
                None => {
                    return Some(forbidden(
                        "Cannot verify folder scope without an access token.",
                    ));
                }
            };
            match file_in_allowed_tree(&token, &id, &allowed).await {
                Ok(true) => None,
                Ok(false) => Some(forbidden(
                    "This file is outside the folders allowed for this connection.",
                )),
                Err(e) => {
                    tracing::warn!(error = %e, file_id = %id, "drive folder guard: ancestry lookup failed");
                    Some(forbidden(
                        "Could not verify this Google Drive file against the folder allowlist.",
                    ))
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use hyper::{HeaderMap, StatusCode};

    #[test]
    fn extracts_drive_and_docs_ids() {
        assert_eq!(
            file_id_from_path("/drive/v3/files/abc123"),
            Some("abc123".into())
        );
        assert_eq!(
            file_id_from_path("/v1/documents/doc1:batchUpdate"),
            Some("doc1".into())
        );
        assert_eq!(
            file_id_from_path("/v4/spreadsheets/sheet1/values/A1"),
            Some("sheet1".into())
        );
        assert_eq!(
            file_id_from_path("/v1/presentations/p1/pages/p2"),
            Some("p1".into())
        );
        assert_eq!(file_id_from_path("/drive/v3/files"), None);
        assert_eq!(file_id_from_path("/drive/v3/files/generateIds"), None);
    }

    #[test]
    fn classifies_list_vs_file() {
        assert_eq!(
            classify("www.googleapis.com", "GET", "/drive/v3/files"),
            Some(DriveTarget::List { q: None })
        );
        assert_eq!(
            classify(
                "www.googleapis.com",
                "GET",
                "/drive/v3/files?q=%27abc%27%20in%20parents"
            ),
            Some(DriveTarget::List {
                q: Some("'abc' in parents".into())
            })
        );
        assert_eq!(
            classify("docs.googleapis.com", "GET", "/v1/documents/xyz"),
            Some(DriveTarget::File { id: "xyz".into() })
        );
        assert_eq!(
            classify("www.googleapis.com", "GET", "/gmail/v1/users/me"),
            None
        );
    }

    #[test]
    fn parses_parent_clauses() {
        assert_eq!(
            parent_ids_in_query("'abc' in parents and trashed=false"),
            vec!["abc"]
        );
        assert_eq!(
            parent_ids_in_query("'a' in parents or 'b' in parents"),
            vec!["a", "b"]
        );
        assert!(parent_ids_in_query("name contains 'x'").is_empty());
    }

    #[test]
    fn reads_parents_from_create_body() {
        assert_eq!(
            parents_from_body(Some(br#"{"name":"x","parents":["fold1"]}"#)),
            vec!["fold1"]
        );
        assert!(parents_from_body(Some(br#"{"name":"x"}"#)).is_empty());
        assert!(parents_from_body(None).is_empty());
    }

    #[test]
    fn drive_folders_reads_policy() {
        let policy = serde_json::json!({ "driveFolders": ["a", "b"] });
        assert_eq!(
            drive_folders(Some(&policy)),
            Some(vec!["a".into(), "b".into()])
        );
        assert_eq!(drive_folders(None), None);
        assert_eq!(
            drive_folders(Some(&serde_json::json!({ "folders": ["/x"] }))),
            None
        );
    }

    #[tokio::test]
    async fn allowlisted_file_skips_ancestry_lookup() {
        let headers = HeaderMap::new();
        let resp = enforce(
            "www.googleapis.com",
            "GET",
            "/drive/v3/files/allowed",
            &headers,
            None,
            &["allowed".into()],
        )
        .await;
        assert!(resp.is_none());
    }

    #[tokio::test]
    async fn docs_id_in_allowlist_is_allowed() {
        let headers = HeaderMap::new();
        let resp = enforce(
            "docs.googleapis.com",
            "GET",
            "/v1/documents/allowed",
            &headers,
            None,
            &["allowed".into()],
        )
        .await;
        assert!(resp.is_none());
    }

    #[tokio::test]
    async fn about_is_allowed_under_a_folder_scope() {
        let headers = HeaderMap::new();
        let resp = enforce(
            "www.googleapis.com",
            "GET",
            "/drive/v3/about",
            &headers,
            None,
            &["fold-1".into()],
        )
        .await;
        assert!(resp.is_none());
    }

    #[tokio::test]
    async fn unscoped_list_is_forbidden() {
        let headers = HeaderMap::new();
        let resp = enforce(
            "www.googleapis.com",
            "GET",
            "/drive/v3/files",
            &headers,
            None,
            &["fold-1".into()],
        )
        .await;
        assert_eq!(resp.map(|r| r.status()), Some(StatusCode::FORBIDDEN));
    }

    #[tokio::test]
    async fn create_without_parents_is_forbidden() {
        let headers = HeaderMap::new();
        let resp = enforce(
            "www.googleapis.com",
            "POST",
            "/drive/v3/files",
            &headers,
            Some(br#"{"name":"x"}"#),
            &["fold-1".into()],
        )
        .await;
        assert_eq!(resp.map(|r| r.status()), Some(StatusCode::FORBIDDEN));
    }

    #[tokio::test]
    async fn batch_is_forbidden_when_scoped() {
        let headers = HeaderMap::new();
        let resp = enforce(
            "www.googleapis.com",
            "POST",
            "/batch/drive/v3",
            &headers,
            None,
            &["fold-1".into()],
        )
        .await;
        assert_eq!(resp.map(|r| r.status()), Some(StatusCode::FORBIDDEN));
    }

    #[tokio::test]
    async fn empty_allowlist_is_forbidden() {
        let headers = HeaderMap::new();
        let resp = enforce(
            "www.googleapis.com",
            "GET",
            "/drive/v3/about",
            &headers,
            None,
            &[],
        )
        .await;
        assert_eq!(resp.map(|r| r.status()), Some(StatusCode::FORBIDDEN));
    }

    #[tokio::test]
    async fn file_outside_allowlist_without_token_is_forbidden() {
        let headers = HeaderMap::new();
        let resp = enforce(
            "www.googleapis.com",
            "GET",
            "/drive/v3/files/other",
            &headers,
            None,
            &["fold-1".into()],
        )
        .await;
        assert_eq!(resp.map(|r| r.status()), Some(StatusCode::FORBIDDEN));
    }
}
