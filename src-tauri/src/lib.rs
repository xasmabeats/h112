pub mod archive;
pub mod media;
pub mod model;
mod process_guard;
#[cfg(windows)]
pub use process_guard::exclusive_instance;
pub mod render;
use model::*;
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

pub struct Active {
    pub id: String,
    pub cancel: Arc<AtomicBool>,
}
pub struct Service {
    pub root: PathBuf,
    pub ffmpeg: PathBuf,
    pub ffprobe: PathBuf,
    pub catalog: Mutex<Catalog>,
    pub active: Mutex<Option<Active>>,
}
pub fn atomic_json<T: serde::Serialize>(path: &Path, value: &T) -> Result<()> {
    let tmp = path.with_extension("pending");
    let data = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    let mut f = File::create(&tmp).map_err(|e| e.to_string())?;
    f.write_all(&data)
        .and_then(|_| f.sync_all())
        .map_err(|e| e.to_string())?;
    drop(f); // Close the file before Windows atomically promotes its name.
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}
pub fn checksum(path: &Path) -> Result<String> {
    let mut f = File::open(path).map_err(|e| e.to_string())?;
    let mut h = Sha256::new();
    let mut b = [0; 65536];
    loop {
        let n = f.read(&mut b).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        h.update(&b[..n]);
    }
    Ok(format!("{:x}", h.finalize()))
}
impl Service {
    pub fn open(root: PathBuf, ffmpeg: PathBuf, ffprobe: PathBuf) -> Result<Arc<Self>> {
        for dir in ["media", "outputs", "temporary", "restores", "recovery"] {
            fs::create_dir_all(root.join(dir)).map_err(|e| e.to_string())?;
        }
        let path = root.join("catalog.json");
        let mut catalog: Catalog = if path.exists() {
            if fs::metadata(&path).map_err(|e| e.to_string())?.len() > MAX_DB {
                return Err("Native catalog exceeds limit".into());
            }
            serde_json::from_reader(File::open(&path).map_err(|e| e.to_string())?).map_err(|e| {
                format!("Native catalog is corrupt; preserve it and restore a backup: {e}")
            })?
        } else {
            Catalog::default()
        };
        for media in &catalog.media {
            valid_id(&media.id)?;
            if !["mp3", "wav", "png", "jpg"].contains(&media.format.as_str()) {
                return Err("Unsupported managed media record".into());
            }
        }
        for job in &mut catalog.jobs {
            valid_id(&job.id)?;
            job.request.validate()?;
            if !job.state.terminal() {
                job.state = JobState::Interrupted;
                job.error=Some("Application stopped before this attempt completed. Retry creates a new attempt.".into());
                job.updated_at = now();
            }
        }
        atomic_json(&path, &catalog)?;
        // Only owned partial imports/renders are removed; immutable media and completed outputs stay.
        for entry in fs::read_dir(root.join("temporary")).map_err(|e| e.to_string())? {
            let p = entry.map_err(|e| e.to_string())?.path();
            if p.is_file() {
                fs::remove_file(p).map_err(|e| e.to_string())?;
            }
        }
        // Restore staging paths are never committed references. Promoted immutable
        // files already live in media/, so clearing abandoned staging is restart-safe.
        for entry in fs::read_dir(root.join("restores")).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if entry.file_type().map_err(|e| e.to_string())?.is_dir()
                && valid_id(&entry.file_name().to_string_lossy()).is_ok()
            {
                fs::remove_dir_all(entry.path()).map_err(|e| e.to_string())?;
            }
        }
        Ok(Arc::new(Self {
            root,
            ffmpeg,
            ffprobe,
            catalog: Mutex::new(catalog),
            active: Mutex::new(None),
        }))
    }
    pub fn save(&self, catalog: &Catalog) -> Result<()> {
        if serde_json::to_vec(catalog)
            .map_err(|e| e.to_string())?
            .len() as u64
            > MAX_DB
        {
            return Err("Native catalog reached its 25 MB safety limit. Preserve a backup before further changes.".into());
        }
        atomic_json(&self.root.join("catalog.json"), catalog)
    }
    pub fn media_path(&self, id: &str) -> Result<PathBuf> {
        valid_id(id)?;
        let c = self.catalog.lock().map_err(|_| "Catalog lock failed")?;
        let m = c
            .media
            .iter()
            .find(|m| m.id == id)
            .ok_or("Media reference is unavailable; reimport the original file")?;
        let p = self.root.join("media").join(m.file_name());
        ensure_regular(&p)?;
        Ok(p)
    }
    pub fn output_path(&self, id: &str) -> Result<PathBuf> {
        valid_id(id)?;
        let c = self.catalog.lock().map_err(|_| "Catalog lock failed")?;
        if !c
            .jobs
            .iter()
            .any(|j| j.id == id && j.state == JobState::Completed)
        {
            return Err("A completed local render is required".into());
        }
        let p = self.root.join("outputs").join(format!("{id}.mp4"));
        ensure_regular(&p)?;
        Ok(p)
    }
    pub fn snapshot(&self) -> Result<Snapshot> {
        let catalog = self
            .catalog
            .lock()
            .map_err(|_| "Catalog lock failed")?
            .clone();
        let active_job_id = self
            .active
            .lock()
            .map_err(|_| "Active lock failed")?
            .as_ref()
            .map(|a| a.id.clone());
        let mut media_urls = BTreeMap::new();
        let mut output_urls = BTreeMap::new();
        for m in &catalog.media {
            if let Ok(p) = self.media_path(&m.id) {
                media_urls.insert(m.id.clone(), p.to_string_lossy().into_owned());
            }
        }
        for j in &catalog.jobs {
            if let Ok(p) = self.output_path(&j.id) {
                output_urls.insert(j.id.clone(), p.to_string_lossy().into_owned());
            }
        }
        Ok(Snapshot {
            catalog,
            media_urls,
            output_urls,
            active_job_id,
            tools_ready: self.ffmpeg.is_file() && self.ffprobe.is_file(),
        })
    }
    pub fn update_job<F: FnOnce(&mut Job)>(&self, id: &str, update: F) -> Result<()> {
        let mut c = self.catalog.lock().map_err(|_| "Catalog lock failed")?;
        let mut next = c.clone();
        let j = next
            .jobs
            .iter_mut()
            .find(|j| j.id == id)
            .ok_or("Unknown render")?;
        if j.state.terminal() {
            return Ok(());
        }
        update(j);
        j.updated_at = now();
        self.save(&next)?;
        *c = next;
        Ok(())
    }
    pub fn cancel(&self, id: &str) -> Result<()> {
        valid_id(id)?;
        if let Some(a) = self
            .active
            .lock()
            .map_err(|_| "Active lock failed")?
            .as_ref()
        {
            if a.id == id {
                a.cancel.store(true, Ordering::SeqCst);
            }
        }
        Ok(())
    }
    pub fn shutdown(&self) {
        if let Ok(active) = self.active.lock() {
            if let Some(a) = active.as_ref() {
                a.cancel.store(true, Ordering::SeqCst);
            }
        }
        for _ in 0..100 {
            if self.active.lock().map(|a| a.is_none()).unwrap_or(true) {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
    }
    pub fn busy(&self) -> bool {
        self.active.lock().map(|a| a.is_some()).unwrap_or(true)
    }
}

pub mod tool_checksums;
