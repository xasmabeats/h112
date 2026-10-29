use serde::{Deserialize, Serialize};
use std::path::Path;

pub const AUDIO_LIMIT: u64 = 300 * 1024 * 1024;
pub const ART_LIMIT: u64 = 20 * 1024 * 1024;
pub const MAX_DURATION: f64 = 7200.0;
pub const MAX_DB: u64 = 25 * 1024 * 1024;
pub type Result<T> = std::result::Result<T, String>;
pub fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
pub fn id() -> String {
    uuid::Uuid::new_v4().to_string()
}
pub fn valid_id(s: &str) -> Result<()> {
    uuid::Uuid::parse_str(s)
        .ok()
        .filter(|id| id.to_string() == s)
        .map(|_| ())
        .ok_or_else(|| "Invalid native identifier".into())
}
pub fn text(s: &str, max: usize) -> Result<()> {
    if s.len() > max {
        Err("Text exceeds supported size".into())
    } else {
        Ok(())
    }
}
pub fn bounded(s: &str) -> String {
    s.chars()
        .rev()
        .take(4096)
        .collect::<String>()
        .chars()
        .rev()
        .collect()
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Media {
    pub id: String,
    pub kind: String,
    pub original_name: String,
    pub format: String,
    pub mime: String,
    pub bytes: u64,
    pub duration: Option<f64>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub sha256: String,
    pub version: u32,
    pub created_at: String,
    pub managed: bool,
}
impl Media {
    pub fn file_name(&self) -> String {
        format!("{}.{}", self.id, self.format)
    }
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Metadata {
    pub title: String,
    pub description: String,
    pub tags: String,
    pub hashtags: String,
    pub filename: String,
    pub pinned_comment: String,
}
impl Metadata {
    pub fn validate(&self) -> Result<()> {
        text(&self.title, 2000)?;
        text(&self.description, 40000)?;
        text(&self.tags, 10000)?;
        text(&self.hashtags, 10000)?;
        text(&self.filename, 1000)?;
        text(&self.pinned_comment, 40000)
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RenderRequest {
    pub beat_id: String,
    pub release_id: String,
    pub audio_id: String,
    pub artwork_id: String,
    pub metadata: Metadata,
}
impl RenderRequest {
    pub fn validate(&self) -> Result<()> {
        valid_id(&self.beat_id)?;
        valid_id(&self.release_id)?;
        valid_id(&self.audio_id)?;
        valid_id(&self.artwork_id)?;
        self.metadata.validate()
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum JobState {
    Probing,
    Preparing,
    Encoding,
    Validating,
    Completed,
    Cancelled,
    Failed,
    Interrupted,
}
impl JobState {
    pub fn terminal(&self) -> bool {
        matches!(
            self,
            Self::Completed | Self::Cancelled | Self::Failed | Self::Interrupted
        )
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: String,
    pub attempt: u32,
    pub request: RenderRequest,
    pub audio: Media,
    pub artwork: Media,
    pub state: JobState,
    pub progress: f64,
    pub created_at: String,
    pub updated_at: String,
    pub error: Option<String>,
    pub output_bytes: Option<u64>,
    pub output_sha256: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRecord {
    pub id: String,
    pub job_id: String,
    pub release_id: String,
    pub beat_id: String,
    pub created_at: String,
    pub kind: String,
    pub destination_name: String,
    pub bytes: u64,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Catalog {
    pub media: Vec<Media>,
    pub jobs: Vec<Job>,
    pub exports: Vec<ExportRecord>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub catalog: Catalog,
    pub media_urls: std::collections::BTreeMap<String, String>,
    pub output_urls: std::collections::BTreeMap<String, String>,
    pub active_job_id: Option<String>,
    pub tools_ready: bool,
}
pub fn safe_name(s: &str) -> String {
    let mut out: String = s
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .take(80)
        .collect();
    while out.ends_with('_') {
        out.pop();
    }
    if out.is_empty() {
        out = "release".into();
    }
    format!("XASMA_{out}")
}
pub fn ensure_regular(path: &Path) -> Result<()> {
    let m = std::fs::symlink_metadata(path)
        .map_err(|_| "Managed file is missing. Reimport it from your original file.".to_string())?;
    if !m.is_file() || m.file_type().is_symlink() {
        return Err("Managed path is not a regular file".into());
    }
    Ok(())
}
