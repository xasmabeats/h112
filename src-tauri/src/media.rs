use crate::{model::*, Service};
use serde::Deserialize;
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::Path,
    process::{Command, Stdio},
    time::{Duration, Instant},
};
#[derive(Debug, Deserialize)]
pub struct Probe {
    pub streams: Vec<Stream>,
    pub format: Format,
}
#[derive(Debug, Deserialize)]
pub struct Stream {
    pub codec_type: Option<String>,
    pub codec_name: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub pix_fmt: Option<String>,
    pub avg_frame_rate: Option<String>,
}
#[derive(Debug, Deserialize)]
pub struct Format {
    pub duration: Option<String>,
    pub format_name: Option<String>,
}
pub fn command(executable: &Path) -> Command {
    let mut c = Command::new(executable);
    c.stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x08000000);
    }
    c
}
pub fn run_bounded(mut c: Command, timeout: Duration) -> Result<Vec<u8>> {
    c.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = c
        .spawn()
        .map_err(|e| format!("Media tool could not start: {e}"))?;
    let _lifetime = crate::process_guard::track(&mut child)?;
    let stdout = child.stdout.take().ok_or("Missing stdout")?;
    let stderr = child.stderr.take().ok_or("Missing stderr")?;
    let out = std::thread::spawn(move || {
        let mut b = Vec::new();
        let _ = stdout.take(1024 * 1024).read_to_end(&mut b);
        b
    });
    let err = std::thread::spawn(move || {
        let mut b = Vec::new();
        let _ = stderr.take(65536).read_to_end(&mut b);
        b
    });
    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(s)) => break s,
            Ok(None) => {}
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(e.to_string());
            }
        }
        if started.elapsed() > timeout {
            let _ = child.kill();
            let _ = child.wait();
            let _ = out.join();
            let _ = err.join();
            return Err("Media validation timed out".into());
        }
        std::thread::sleep(Duration::from_millis(25));
    };
    let output = out.join().map_err(|_| "Output reader failed")?;
    let error = err.join().map_err(|_| "Error reader failed")?;
    if !status.success() {
        return Err(format!(
            "Media validation failed: {}",
            bounded(&String::from_utf8_lossy(&error))
        ));
    }
    Ok(output)
}
pub fn probe(tool: &Path, path: &Path) -> Result<Probe> {
    let mut c = command(tool);
    c.args([
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-show_entries",
        "stream=codec_type,codec_name,width,height,pix_fmt,avg_frame_rate:format=duration,format_name",
        "-of",
        "json",
    ])
    .arg(path);
    let b = run_bounded(c, Duration::from_secs(30))?;
    serde_json::from_slice(&b).map_err(|e| format!("Invalid probe output: {e}"))
}
pub fn signature(bytes: &[u8]) -> Result<(&'static str, &'static str, &'static str)> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Ok(("artwork", "png", "image/png"))
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Ok(("artwork", "jpg", "image/jpeg"))
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WAVE" {
        Ok(("audio", "wav", "audio/wav"))
    } else if bytes.starts_with(b"ID3")
        || (bytes.len() > 1 && bytes[0] == 0xff && bytes[1] & 0xe0 == 0xe0)
    {
        Ok(("audio", "mp3", "audio/mpeg"))
    } else {
        Err("Unsupported signature. Choose MP3/WAV audio or PNG/JPEG artwork.".into())
    }
}
impl Service {
    pub fn import_media(&self, source: &Path, kind: &str) -> Result<Media> {
        if !["audio", "artwork"].contains(&kind) {
            return Err("Invalid media kind".into());
        }
        ensure_regular(source)?;
        let limit = if kind == "audio" {
            AUDIO_LIMIT
        } else {
            ART_LIMIT
        };
        let size = fs::metadata(source).map_err(|e| e.to_string())?.len();
        if size == 0 || size > limit {
            return Err(format!(
                "File must be nonempty and at most {} MB",
                limit / 1024 / 1024
            ));
        }
        let media_id = id();
        let tmp = self
            .root
            .join("temporary")
            .join(format!("{media_id}.import"));
        let result = (|| {
            let mut input = File::open(source).map_err(|e| e.to_string())?;
            let mut header = [0; 16];
            let n = input.read(&mut header).map_err(|e| e.to_string())?;
            let (detected, ext, mime) = signature(&header[..n])?;
            if kind != detected {
                return Err("The detected file type does not match this import".into());
            }
            let mut input = File::open(source).map_err(|e| e.to_string())?;
            let mut output = File::create(&tmp).map_err(|e| e.to_string())?;
            let copied = std::io::copy(
                &mut std::io::Read::by_ref(&mut input).take(limit + 1),
                &mut output,
            )
            .map_err(|e| e.to_string())?;
            if copied == 0 || copied > limit {
                return Err("File size changed or exceeds the import limit".into());
            }
            output
                .flush()
                .and_then(|_| output.sync_all())
                .map_err(|e| e.to_string())?;
            let p = probe(&self.ffprobe, &tmp)?;
            let (duration, width, height) = if kind == "audio" {
                let stream = p
                    .streams
                    .iter()
                    .find(|s| s.codec_type.as_deref() == Some("audio"))
                    .ok_or("No audio stream found")?;
                let codec = stream.codec_name.as_deref().unwrap_or("");
                if (ext == "mp3" && codec != "mp3") || (ext == "wav" && !codec.starts_with("pcm_"))
                {
                    return Err("Unsupported audio encoding; use MP3 or PCM WAV".into());
                }
                let duration = p
                    .format
                    .duration
                    .as_ref()
                    .and_then(|s| s.parse::<f64>().ok())
                    .ok_or("Cannot determine audio duration")?;
                if !duration.is_finite() || duration <= 0.0 || duration > MAX_DURATION {
                    return Err("Audio duration must be between 0 and 120 minutes".into());
                }
                (Some(duration), None, None)
            } else {
                let stream = p
                    .streams
                    .iter()
                    .find(|s| s.codec_type.as_deref() == Some("video"))
                    .ok_or("Image cannot be decoded")?;
                let w = stream.width.ok_or("Missing image width")?;
                let h = stream.height.ok_or("Missing image height")?;
                if w == 0 || h == 0 || w > 12000 || h > 12000 || w as u64 * h as u64 > 32_000_000 {
                    return Err("Artwork exceeds 12,000px per side or 32 megapixels".into());
                }
                (None, Some(w), Some(h))
            };
            let mut decode = command(&self.ffmpeg);
            decode
                .args([
                    "-v",
                    "error",
                    "-xerror",
                    "-err_detect",
                    "explode",
                    "-max_alloc",
                    "268435456",
                    "-protocol_whitelist",
                    "file,pipe",
                    "-i",
                ])
                .arg(&tmp)
                .args(["-f", "null", "-"]);
            run_bounded(decode, Duration::from_secs(120))?;
            let sha256 = crate::checksum(&tmp)?;
            let media = Media {
                id: media_id.clone(),
                kind: kind.into(),
                original_name: source
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .chars()
                    .take(255)
                    .collect(),
                format: ext.into(),
                mime: mime.into(),
                bytes: copied,
                duration,
                width,
                height,
                sha256,
                version: 1,
                created_at: now(),
                managed: true,
            };
            let destination = self.root.join("media").join(media.file_name());
            fs::rename(&tmp, &destination).map_err(|e| e.to_string())?;
            let mut catalog = self.catalog.lock().map_err(|_| "Catalog lock failed")?;
            catalog.media.push(media.clone());
            if let Err(e) = self.save(&catalog) {
                catalog.media.retain(|m| m.id != media.id);
                let _ = fs::remove_file(&destination);
                return Err(e);
            }
            Ok(media)
        })();
        let _ = fs::remove_file(&tmp);
        result
    }
}
