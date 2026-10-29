use crate::{model::*, Service};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs::{self, File},
    io::{Read, Write},
    path::Path,
};
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};
const EXPANSION_LIMIT: u64 = 2 * 1024 * 1024 * 1024;
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Manifest {
    format: String,
    version: u32,
    metadata_sha256: String,
    includes_generated_video: bool,
    media: Vec<Media>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedRestore {
    pub transaction_id: String,
    pub metadata_json: String,
    pub media_count: usize,
    pub includes_generated_video: bool,
}
fn hash_bytes(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(bytes))
}
fn metadata_media(data: &str) -> Result<Vec<Media>> {
    text(data, MAX_DB as usize)?;
    let v: serde_json::Value = serde_json::from_str(data).map_err(|e| e.to_string())?;
    if v["schemaVersion"] != 2 {
        return Err("Portable backups require schema version 2".into());
    }
    serde_json::from_value(v["media"].clone()).map_err(|e| format!("Invalid media metadata: {e}"))
}
fn read_entry(archive: &mut ZipArchive<File>, name: &str, limit: u64) -> Result<Vec<u8>> {
    let mut entry = archive.by_name(name).map_err(|e| e.to_string())?;
    if entry.size() > limit {
        return Err("Archive entry exceeds size limit".into());
    }
    let mut bytes = Vec::new();
    entry
        .by_ref()
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > limit {
        return Err("Archive expansion exceeds limit".into());
    }
    Ok(bytes)
}
impl Service {
    pub fn portable_write(&self, data: &str, destination: &Path, overwrite: bool) -> Result<()> {
        let requested = metadata_media(data)?;
        if requested.len() > 10000 {
            return Err("Too many media records".into());
        }
        let mut media = Vec::new();
        let mut ids = HashSet::new();
        for m in requested {
            valid_id(&m.id)?;
            if !ids.insert(m.id.clone()) {
                return Err("Duplicate media ID".into());
            }
            let path = self.media_path(&m.id)?;
            let actual = self
                .catalog
                .lock()
                .map_err(|_| "Catalog lock failed")?
                .media
                .iter()
                .find(|a| a.id == m.id)
                .ok_or("Missing native media")?
                .clone();
            if actual != m || crate::checksum(&path)? != m.sha256 {
                return Err("Media is missing or changed; backup was not created".into());
            }
            media.push(actual);
        }
        if destination.exists() && !overwrite {
            return Err(
                "Destination already exists; explicit overwrite confirmation is required".into(),
            );
        }
        let temp = destination.with_file_name(format!(".xasma-{}.zip.pending", id()));
        let result = (|| {
            let file = File::create(&temp).map_err(|e| e.to_string())?;
            let mut zip = ZipWriter::new(file);
            let opts = SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated)
                .unix_permissions(0o600);
            let manifest = Manifest {
                format: "xasma-portable".into(),
                version: 1,
                metadata_sha256: hash_bytes(data.as_bytes()),
                includes_generated_video: false,
                media: media.clone(),
            };
            zip.start_file("manifest.json", opts)
                .map_err(|e| e.to_string())?;
            zip.write_all(&serde_json::to_vec(&manifest).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
            zip.start_file("metadata.json", opts)
                .map_err(|e| e.to_string())?;
            zip.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
            let mut total = data.len() as u64;
            for m in media {
                total += m.bytes;
                if total > EXPANSION_LIMIT {
                    return Err("Portable backup exceeds 2 GB supported size".into());
                }
                zip.start_file(format!("media/{}", m.file_name()), opts)
                    .map_err(|e| e.to_string())?;
                let mut input = File::open(self.media_path(&m.id)?).map_err(|e| e.to_string())?;
                let mut bytes = Vec::new();
                std::io::Read::by_ref(&mut input)
                    .take(m.bytes + 1)
                    .read_to_end(&mut bytes)
                    .map_err(|e| e.to_string())?;
                if bytes.len() as u64 != m.bytes || hash_bytes(&bytes) != m.sha256 {
                    return Err("Managed media changed during backup".into());
                }
                zip.write_all(&bytes).map_err(|e| e.to_string())?;
            }
            zip.finish()
                .map_err(|e| e.to_string())?
                .sync_all()
                .map_err(|e| e.to_string())?;
            fs::rename(&temp, destination).map_err(|e| e.to_string())?;
            Ok(())
        })();
        if result.is_err() {
            let _ = fs::remove_file(temp);
        }
        result
    }
    pub fn prepare_archive(&self, path: &Path) -> Result<PreparedRestore> {
        if self.busy() {
            return Err("Finish or cancel rendering before restoring".into());
        }
        ensure_regular(path)?;
        if fs::metadata(path).map_err(|e| e.to_string())?.len() > EXPANSION_LIMIT {
            return Err("Archive exceeds 2 GB limit".into());
        }
        let mut archive = ZipArchive::new(File::open(path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        if archive.len() > 10002 {
            return Err("Too many archive entries".into());
        }
        let mut names = HashSet::new();
        let mut total = 0u64;
        for i in 0..archive.len() {
            let e = archive.by_index(i).map_err(|e| e.to_string())?;
            let name = e.name();
            if e.is_dir()
                || name.contains('\\')
                || name.starts_with('/')
                || name
                    .split('/')
                    .any(|s| s == ".." || s == "." || s.is_empty())
                || e.unix_mode()
                    .map(|m| m & 0o170000 == 0o120000)
                    .unwrap_or(false)
                || !names.insert(name.to_owned())
            {
                return Err("Unsafe, duplicate, or non-file archive entry".into());
            }
            total = total.checked_add(e.size()).ok_or("Archive size overflow")?;
            if total > EXPANSION_LIMIT || e.size() > AUDIO_LIMIT.max(MAX_DB) {
                return Err("Archive expansion exceeds limits".into());
            }
        }
        let manifest: Manifest =
            serde_json::from_slice(&read_entry(&mut archive, "manifest.json", MAX_DB)?)
                .map_err(|e| e.to_string())?;
        if manifest.format != "xasma-portable"
            || manifest.version != 1
            || manifest.includes_generated_video
        {
            return Err("Unsupported portable archive version or generated-video content".into());
        }
        let metadata = read_entry(&mut archive, "metadata.json", MAX_DB)?;
        if hash_bytes(&metadata) != manifest.metadata_sha256 {
            return Err("Backup metadata checksum mismatch".into());
        }
        let metadata_json = String::from_utf8(metadata).map_err(|e| e.to_string())?;
        let records = metadata_media(&metadata_json)?;
        if records != manifest.media {
            return Err("Manifest/media references do not match database metadata".into());
        }
        let mut allowed = HashSet::from(["manifest.json".to_string(), "metadata.json".to_string()]);
        let mut ids = HashSet::new();
        for m in &records {
            valid_id(&m.id)?;
            if !ids.insert(&m.id) || !["mp3", "wav", "png", "jpg"].contains(&m.format.as_str()) {
                return Err("Invalid or duplicate managed media".into());
            }
            allowed.insert(format!("media/{}", m.file_name()));
        }
        if names != allowed {
            return Err("Archive has missing attachments or unexpected entries".into());
        }
        let transaction_id = id();
        let stage = self.root.join("restores").join(&transaction_id);
        fs::create_dir(&stage).map_err(|e| e.to_string())?;
        let result = (|| {
            for m in &records {
                let limit = if m.kind == "audio" {
                    AUDIO_LIMIT
                } else {
                    ART_LIMIT
                };
                let bytes = read_entry(&mut archive, &format!("media/{}", m.file_name()), limit)?;
                if bytes.len() as u64 != m.bytes || hash_bytes(&bytes) != m.sha256 {
                    return Err("Attachment size/checksum mismatch".into());
                }
                let mut f = File::create(stage.join(m.file_name())).map_err(|e| e.to_string())?;
                f.write_all(&bytes)
                    .and_then(|_| f.sync_all())
                    .map_err(|e| e.to_string())?;
                self.validate_staged_media(&stage.join(m.file_name()), m)?;
            }
            crate::atomic_json(&stage.join("manifest.json"), &manifest)?;
            let mut f = File::create(stage.join("metadata.json")).map_err(|e| e.to_string())?;
            f.write_all(metadata_json.as_bytes())
                .and_then(|_| f.sync_all())
                .map_err(|e| e.to_string())?;
            Ok(PreparedRestore {
                transaction_id: transaction_id.clone(),
                metadata_json,
                media_count: records.len(),
                includes_generated_video: false,
            })
        })();
        if result.is_err() {
            let _ = fs::remove_dir_all(stage);
        }
        result
    }
    pub fn promote_archive(&self, transaction_id: &str) -> Result<()> {
        valid_id(transaction_id)?;
        if self.busy() {
            return Err("Cannot restore during a render".into());
        }
        let stage = self.root.join("restores").join(transaction_id);
        let path = stage.join("manifest.json");
        ensure_regular(&path)?;
        let manifest: Manifest =
            serde_json::from_reader(File::open(path).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        let mut c = self.catalog.lock().map_err(|_| "Catalog lock failed")?;
        let mut next = c.clone();
        // Validate every collision before promoting any file. New IDs are immutable;
        // a DB failure can leave safe extra copies, never dangling committed DB references.
        for m in &manifest.media {
            valid_id(&m.id)?;
            if let Some(old) = c.media.iter().find(|v| v.id == m.id) {
                if old != m {
                    return Err(
                        "Media ID collision with different content; existing data is preserved"
                            .into(),
                    );
                }
            }
            let target = self.root.join("media").join(m.file_name());
            if target.exists() && crate::checksum(&target)? != m.sha256 {
                return Err("Existing managed file differs from archive".into());
            }
            if crate::checksum(&stage.join(m.file_name()))? != m.sha256 {
                return Err("Staged media was modified".into());
            }
        }
        for m in &manifest.media {
            let destination = self.root.join("media").join(m.file_name());
            if !destination.exists() {
                let partial = self
                    .root
                    .join("temporary")
                    .join(format!("{}.restore", m.id));
                let mut input = File::open(stage.join(m.file_name())).map_err(|e| e.to_string())?;
                let mut output = File::create(&partial).map_err(|e| e.to_string())?;
                std::io::copy(&mut input, &mut output)
                    .and_then(|_| output.sync_all())
                    .map_err(|e| e.to_string())?;
                drop(output);
                drop(input);
                fs::rename(&partial, destination).map_err(|e| e.to_string())?;
            }
            if !next.media.iter().any(|v| v.id == m.id) {
                next.media.push(m.clone());
            }
        }
        self.save(&next)?;
        *c = next;
        crate::atomic_json(
            &stage.join("promoted.json"),
            &serde_json::json!({"promotedAt":now()}),
        )?;
        Ok(())
    }
    pub fn finish_archive(&self, transaction_id: &str) -> Result<()> {
        valid_id(transaction_id)?;
        let stage = self.root.join("restores").join(transaction_id);
        if stage.exists() {
            fs::remove_dir_all(stage).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    pub fn recovery(&self, metadata: &str) -> Result<String> {
        let _ = metadata_media(metadata)?;
        let name = format!("recovery-{}.json", id());
        let mut f =
            File::create(self.root.join("recovery").join(&name)).map_err(|e| e.to_string())?;
        f.write_all(metadata.as_bytes())
            .and_then(|_| f.sync_all())
            .map_err(|e| e.to_string())?;
        Ok(name)
    }
    pub(crate) fn validate_staged_media(&self, path: &Path, m: &Media) -> Result<()> {
        let mut f = File::open(path).map_err(|e| e.to_string())?;
        let mut header = [0; 16];
        let n = f.read(&mut header).map_err(|e| e.to_string())?;
        let (kind, format, mime) = crate::media::signature(&header[..n])?;
        if kind != m.kind || format != m.format || mime != m.mime || !m.managed || m.version != 1 {
            return Err("Attachment type/version is invalid".into());
        }
        let p = crate::media::probe(&self.ffprobe, path)?;
        if kind == "audio" {
            let duration = p
                .format
                .duration
                .and_then(|s| s.parse::<f64>().ok())
                .ok_or("Attachment has no duration")?;
            let expected = m.duration.ok_or("Missing attachment duration")?;
            if !duration.is_finite()
                || duration <= 0.0
                || duration > MAX_DURATION
                || (duration - expected).abs() > 0.25
                || !p
                    .streams
                    .iter()
                    .any(|s| s.codec_type.as_deref() == Some("audio"))
            {
                return Err("Invalid audio attachment".into());
            }
        } else {
            let v = p
                .streams
                .iter()
                .find(|s| s.codec_type.as_deref() == Some("video"))
                .ok_or("Invalid image")?;
            let (w, h) = (v.width.unwrap_or(0), v.height.unwrap_or(0));
            if Some(w) != m.width
                || Some(h) != m.height
                || w == 0
                || h == 0
                || w > 12000
                || h > 12000
                || w as u64 * h as u64 > 32_000_000
            {
                return Err("Invalid artwork attachment".into());
            }
        }
        Ok(())
    }
}
