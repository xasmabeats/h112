use crate::{
    media::{command, probe},
    model::*,
    Active, Service,
};
use std::{
    fs::{self, File},
    io::{BufRead, BufReader, Read, Write},
    path::Path,
    process::Stdio,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc,
    },
    time::Duration,
};

// Fixed, reviewed encoder preset; the frontend supplies no filters or arguments.
const ARTWORK_INPUT: &[&str] = &[
    "-hide_banner",
    "-v",
    "error",
    "-nostdin",
    "-n",
    "-protocol_whitelist",
    "file,pipe",
    "-loop",
    "1",
    "-framerate",
    "30",
    "-i",
];
const AUDIO_INPUT: &[&str] = &["-protocol_whitelist", "file,pipe", "-i"];
const VIDEO_FILTER:&str="scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p";
const OUTPUT_PRESET: &[&str] = &[
    "-map_metadata",
    "-1",
    "-map_metadata:s",
    "-1",
    "-map_chapters",
    "-1",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-vf",
    VIDEO_FILTER,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-tune",
    "stillimage",
    "-crf",
    "20",
    "-threads",
    "2",
    "-r",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-t",
];
const PROGRESS_OUTPUT: &[&str] = &[
    "-shortest",
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-nostats",
];

pub fn validate_output(tool: &Path, path: &Path, duration: f64) -> Result<()> {
    let p = probe(tool, path)?;
    let video = p
        .streams
        .iter()
        .find(|s| s.codec_type.as_deref() == Some("video"))
        .ok_or("Rendered output has no video stream")?;
    let audio = p
        .streams
        .iter()
        .find(|s| s.codec_type.as_deref() == Some("audio"))
        .ok_or("Rendered output has no audio stream")?;
    let fps = video
        .avg_frame_rate
        .as_deref()
        .and_then(|s| s.split_once('/'))
        .and_then(|(n, d)| Some(n.parse::<f64>().ok()? / d.parse::<f64>().ok()?))
        .unwrap_or(0.0);
    if video.codec_name.as_deref() != Some("h264")
        || audio.codec_name.as_deref() != Some("aac")
        || video.width != Some(1920)
        || video.height != Some(1080)
        || video.pix_fmt.as_deref() != Some("yuv420p")
        || (fps - 30.0).abs() > 0.001
    {
        return Err(
            "Rendered output does not meet H.264/AAC 1920x1080, yuv420p, 30 FPS requirements"
                .into(),
        );
    }
    let actual = p
        .format
        .duration
        .and_then(|s| s.parse::<f64>().ok())
        .ok_or("Output duration missing")?;
    if !actual.is_finite() || (actual - duration).abs() > 0.25_f64.max(duration * 0.01) {
        return Err(format!(
            "Output duration mismatch: expected {duration:.3}s, got {actual:.3}s"
        ));
    }
    Ok(())
}
impl Service {
    pub fn start(self: &Arc<Self>, request: RenderRequest) -> Result<Job> {
        request.validate()?;
        if !self.ffmpeg.is_file() || !self.ffprobe.is_file() {
            return Err("Bundled FFmpeg/FFprobe is missing. Reinstall a verified installer; no external FFmpeg fallback is used.".into());
        }
        self.media_path(&request.audio_id)?;
        self.media_path(&request.artwork_id)?;
        let mut active = self.active.lock().map_err(|_| "Active lock failed")?;
        if active.is_some() {
            return Err(
                "Another render is active. Cancel or wait before starting an attempt.".into(),
            );
        }
        let mut c = self.catalog.lock().map_err(|_| "Catalog lock failed")?;
        let audio = c
            .media
            .iter()
            .find(|m| m.id == request.audio_id && m.kind == "audio")
            .ok_or("Choose managed audio")?
            .clone();
        let artwork = c
            .media
            .iter()
            .find(|m| m.id == request.artwork_id && m.kind == "artwork")
            .ok_or("Choose managed artwork")?
            .clone();
        let attempt = c
            .jobs
            .iter()
            .filter(|j| j.request.release_id == request.release_id)
            .count() as u32
            + 1;
        let timestamp = now();
        let job = Job {
            id: id(),
            attempt,
            settings: RenderSettings::default(),
            request,
            audio,
            artwork,
            state: JobState::Probing,
            progress: 0.0,
            created_at: timestamp.clone(),
            updated_at: timestamp,
            error: None,
            output_bytes: None,
            output_sha256: None,
        };
        let mut next = c.clone();
        next.jobs.push(job.clone());
        self.save(&next)?;
        *c = next;
        drop(c);
        let cancel = Arc::new(AtomicBool::new(false));
        *active = Some(Active {
            id: job.id.clone(),
            cancel: cancel.clone(),
        });
        drop(active);
        let service = Arc::clone(self);
        let owned = job.clone();
        std::thread::spawn(move || {
            let result = service.encode(&owned, &cancel);
            if let Err(error) = result {
                let is_cancelled = cancel.load(Ordering::SeqCst);
                let _ = service.update_job(&owned.id, |j| {
                    j.state = if is_cancelled {
                        JobState::Cancelled
                    } else {
                        JobState::Failed
                    };
                    j.error = Some(bounded(&error));
                });
            }
            let _ = fs::remove_file(
                service
                    .root
                    .join("temporary")
                    .join(format!("{}.mp4", owned.id)),
            );
            if let Ok(mut a) = service.active.lock() {
                if a.as_ref().map(|a| a.id.as_str()) == Some(&owned.id) {
                    *a = None;
                }
            }
        });
        Ok(job)
    }
    fn encode(&self, job: &Job, cancel: &AtomicBool) -> Result<()> {
        let check = || {
            if cancel.load(Ordering::SeqCst) {
                Err("Render cancelled by user".to_string())
            } else {
                Ok(())
            }
        };
        check()?;
        let audio = self.media_path(&job.audio.id)?;
        let artwork = self.media_path(&job.artwork.id)?;
        if crate::checksum(&audio)? != job.audio.sha256
            || crate::checksum(&artwork)? != job.artwork.sha256
        {
            return Err(
                "Managed source changed outside the application; reimport before rendering".into(),
            );
        }
        let duration = job.audio.duration.ok_or("Audio duration unavailable")?;
        let _ = crate::media::probe_with_cancel(&self.ffprobe, &audio, Some(cancel))?;
        check()?;
        self.update_job(&job.id, |j| j.state = JobState::Preparing)?;
        let tmp = self.root.join("temporary").join(format!("{}.mp4", job.id));
        let mut c = command(&self.ffmpeg);
        c.args(ARTWORK_INPUT)
            .arg(&artwork)
            .args(AUDIO_INPUT)
            .arg(&audio)
            .args(OUTPUT_PRESET)
            .arg(format!("{duration:.6}"))
            .args(PROGRESS_OUTPUT)
            .arg(&tmp)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        check()?;
        let mut child = c
            .spawn()
            .map_err(|e| format!("FFmpeg could not start: {e}"))?;
        let _lifetime = crate::process_guard::track(&mut child)?;
        let stdout = child.stdout.take().ok_or("Missing render stdout")?;
        let stderr = child.stderr.take().ok_or("Missing render stderr")?;
        let (send, receive) = mpsc::channel::<f64>();
        let progress = std::thread::spawn(move || {
            for line in BufReader::new(stdout)
                .lines()
                .map_while(std::result::Result::ok)
            {
                if let Some(value) = line
                    .strip_prefix("out_time_us=")
                    .and_then(|s| s.parse::<f64>().ok())
                {
                    let _ = send.send((value / 1_000_000.0 / duration).clamp(0.0, 0.98));
                }
            }
        });
        let errors = std::thread::spawn(move || {
            let mut b = String::new();
            let _ = stderr.take(65536).read_to_string(&mut b);
            bounded(&b)
        });
        self.update_job(&job.id, |j| j.state = JobState::Encoding)
            .inspect_err(|_| {
                let _ = child.kill();
                let _ = child.wait();
            })?;
        let mut last = 0.0;
        let status = loop {
            if cancel.load(Ordering::SeqCst) {
                let _ = child.kill();
                let _ = child.wait();
                let _ = progress.join();
                let _ = errors.join();
                return Err("Render cancelled by user".into());
            }
            let mut percent = last;
            while let Ok(value) = receive.try_recv() {
                percent = value;
            }
            if percent - last >= 0.01 {
                last = percent;
                if let Err(e) = self.update_job(&job.id, |j| j.progress = percent) {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = progress.join();
                    let _ = errors.join();
                    return Err(e);
                }
            }
            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) => std::thread::sleep(Duration::from_millis(50)),
                Err(e) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(e.to_string());
                }
            }
        };
        let _ = progress.join();
        let diagnostic = errors.join().unwrap_or_else(|_| "Log reader failed".into());
        if !status.success() {
            return Err(format!("FFmpeg exited with {status}: {diagnostic}"));
        }
        check()?;
        self.update_job(&job.id, |j| {
            j.state = JobState::Validating;
            j.progress = 0.99;
        })?;
        validate_output(&self.ffprobe, &tmp, duration)?;
        check()?;
        let hash = crate::checksum(&tmp)?;
        let bytes = fs::metadata(&tmp).map_err(|e| e.to_string())?.len();
        let output = self.root.join("outputs").join(format!("{}.mp4", job.id));
        if output.exists() {
            return Err("Output collision; existing file was preserved".into());
        }
        fs::rename(&tmp, &output).map_err(|e| e.to_string())?;
        if let Err(e) = self.update_job(&job.id, |j| {
            j.state = JobState::Completed;
            j.progress = 1.0;
            j.output_bytes = Some(bytes);
            j.output_sha256 = Some(hash);
        }) {
            let _ = fs::remove_file(&output);
            return Err(e);
        }
        Ok(())
    }
    pub fn export_to_folder(&self, job_id: &str, parent: &Path) -> Result<ExportRecord> {
        let source = self.output_path(job_id)?;
        let job = self
            .catalog
            .lock()
            .map_err(|_| "Catalog lock failed")?
            .jobs
            .iter()
            .find(|j| j.id == job_id)
            .ok_or("Unknown job")?
            .clone();
        if crate::checksum(&source)? != job.output_sha256.clone().unwrap_or_default() {
            return Err("Rendered output changed or is corrupt".into());
        }
        let export_id = id();
        let folder_name = format!("{}-{}", safe_name(&job.request.metadata.title), export_id);
        let temporary = parent.join(format!(".xasma-export-{export_id}"));
        let destination = parent.join(&folder_name);
        if temporary.exists() || destination.exists() {
            return Err("Export collision".into());
        }
        fs::create_dir(&temporary).map_err(|e| e.to_string())?;
        let result = (|| {
            let mut input = File::open(&source).map_err(|e| e.to_string())?;
            let mut output =
                File::create(temporary.join("video.mp4")).map_err(|e| e.to_string())?;
            let bytes = std::io::copy(&mut input, &mut output)
                .and_then(|n| output.sync_all().map(|_| n))
                .map_err(|e| e.to_string())?;
            if crate::checksum(&temporary.join("video.mp4"))?
                != job.output_sha256.clone().unwrap_or_default()
            {
                return Err("Exported video checksum mismatch".into());
            }
            drop(output);
            drop(input);
            crate::atomic_json(&temporary.join("metadata.json"), &job.request.metadata)?;
            let m = &job.request.metadata;
            let content = format!(
                "TITLE\n{}\n\nDESCRIPTION\n{}\n\nTAGS\n{}\n\nHASHTAGS\n{}\n\nPINNED COMMENT\n{}\n",
                m.title, m.description, m.tags, m.hashtags, m.pinned_comment
            );
            let mut f = File::create(temporary.join("metadata.txt")).map_err(|e| e.to_string())?;
            f.write_all(content.as_bytes())
                .and_then(|_| f.sync_all())
                .map_err(|e| e.to_string())?;
            drop(f);
            crate::atomic_json(&temporary.join("manifest.json"), &job)?;
            fs::rename(&temporary, &destination)
                .map_err(|e| format!("Could not promote the closed export folder: {e}"))?;
            let record = ExportRecord {
                id: export_id,
                job_id: job.id,
                release_id: job.request.release_id,
                beat_id: job.request.beat_id,
                created_at: now(),
                kind: "release-folder".into(),
                destination_name: folder_name,
                bytes,
            };
            let mut c = self.catalog.lock().map_err(|_| "Catalog lock failed")?;
            let mut next = c.clone();
            next.exports.push(record.clone());
            self.save(&next).map_err(|e| {
                format!(
                    "Destination files were written, but export history could not be recorded: {e}"
                )
            })?;
            *c = next;
            Ok(record)
        })();
        if result.is_err() {
            let _ = fs::remove_dir_all(&temporary);
        }
        result
    }
}
