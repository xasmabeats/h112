use std::{
    fs,
    path::PathBuf,
    sync::Arc,
    time::{Duration, Instant},
};
use tempfile::TempDir;
use xasma_native::{media::command, model::*, render::validate_output, Service};
fn tools() -> (PathBuf, PathBuf) {
    let a = std::env::var_os("XASMA_TEST_FFMPEG")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/usr/bin/ffmpeg"));
    let b = std::env::var_os("XASMA_TEST_FFPROBE")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/usr/bin/ffprobe"));
    assert!(
        a.is_file() && b.is_file(),
        "Real FFmpeg/FFprobe required; set XASMA_TEST_FFMPEG and XASMA_TEST_FFPROBE"
    );
    (a, b)
}
fn service() -> (TempDir, Arc<Service>) {
    let d = tempfile::tempdir().unwrap();
    let (a, b) = tools();
    let s = Service::open(d.path().join("Studio Δ 音源 space").join("data"), a, b).unwrap();
    (d, s)
}
fn fixture(s: &Service) -> (Media, Media) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    (
        s.import_media(&root.join("tests/fixtures/synthetic-tone.mp3"), "audio")
            .unwrap(),
        s.import_media(&root.join("public/icon-192.png"), "artwork")
            .unwrap(),
    )
}
fn request(audio: &Media, art: &Media) -> RenderRequest {
    RenderRequest {
        beat_id: id(),
        release_id: id(),
        audio_id: audio.id.clone(),
        artwork_id: art.id.clone(),
        metadata: Metadata {
            title: "Synthetic Test".into(),
            description: "Local fixture".into(),
            ..Default::default()
        },
    }
}
fn wait(s: &Service, id: &str) -> Job {
    let start = Instant::now();
    loop {
        let j = s
            .snapshot()
            .unwrap()
            .catalog
            .jobs
            .into_iter()
            .find(|j| j.id == id)
            .unwrap();
        if j.state.terminal() {
            return j;
        }
        assert!(
            start.elapsed() < Duration::from_secs(60),
            "Render did not complete"
        );
        std::thread::sleep(Duration::from_millis(20));
    }
}
#[test]
fn real_render_validate_export_and_portable_restore() {
    let (_d, s) = service();
    let (audio, art) = fixture(&s);
    let job = s.start(request(&audio, &art)).unwrap();
    let finished = wait(&s, &job.id);
    assert_eq!(finished.state, JobState::Completed, "{:?}", finished.error);
    let path = s.output_path(&job.id).unwrap();
    validate_output(&s.ffprobe, &path, audio.duration.unwrap()).unwrap();
    assert_eq!(finished.settings, RenderSettings::default());
    assert!(finished.output_bytes.unwrap() > 1000);
    let mut inspect = command(&s.ffprobe);
    inspect
        .args([
            "-v",
            "error",
            "-show_entries",
            "format_tags=title",
            "-of",
            "json",
        ])
        .arg(&path);
    let tags: serde_json::Value = serde_json::from_slice(
        &xasma_native::media::run_bounded(inspect, Duration::from_secs(10)).unwrap(),
    )
    .unwrap();
    assert!(
        tags["format"]["tags"]["title"].is_null(),
        "Source tags must not leak into exported MP4 metadata"
    );

    let exports = tempfile::tempdir().unwrap();
    let one = s.export_to_folder(&job.id, exports.path()).unwrap();
    let two = s.export_to_folder(&job.id, exports.path()).unwrap();
    assert_ne!(one.id, two.id);
    assert!(exports
        .path()
        .join(&one.destination_name)
        .join("metadata.txt")
        .is_file());
    assert_eq!(s.snapshot().unwrap().catalog.exports.len(), 2);
    let metadata = serde_json::json!({"schemaVersion":2,"media":[audio,art]}).to_string();
    let zip = exports.path().join("portable.zip");
    s.portable_write(&metadata, &zip, false).unwrap();
    assert!(s.portable_write(&metadata, &zip, false).is_err());
    let (_new_dir, new) = service();
    let prepared = new.prepare_archive(&zip).unwrap();
    assert_eq!(prepared.media_count, 2);
    assert!(!prepared.includes_generated_video);
    assert!(new.snapshot().unwrap().catalog.media.is_empty());
    new.promote_archive(&prepared.transaction_id).unwrap();
    for m in &s.snapshot().unwrap().catalog.media {
        assert!(new.media_path(&m.id).unwrap().is_file());
    }
    new.promote_archive(&prepared.transaction_id).unwrap();
    new.finish_archive(&prepared.transaction_id).unwrap();
    assert_eq!(new.snapshot().unwrap().catalog.media.len(), 2);
}
#[test]
fn actual_process_cancellation_and_single_active_job() {
    let (d, s) = service();
    let (_, art) = fixture(&s);
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    let long = d.path().join("long.mp3");
    let status = command(&s.ffmpeg)
        .args(["-v", "error", "-stream_loop", "60", "-i"])
        .arg(root.join("tests/fixtures/synthetic-tone.mp3"))
        .args(["-c:a", "copy"])
        .arg(&long)
        .status()
        .unwrap();
    assert!(status.success());
    let audio = s.import_media(&long, "audio").unwrap();
    let r = request(&audio, &art);
    let job = s.start(r.clone()).unwrap();
    assert!(s.start(r).is_err());
    let start = Instant::now();
    loop {
        let state = s.snapshot().unwrap().catalog.jobs[0].state.clone();
        if state == JobState::Encoding {
            break;
        }
        assert!(
            !state.terminal(),
            "Process finished before cancellation exercise"
        );
        assert!(start.elapsed() < Duration::from_secs(15));
        std::thread::sleep(Duration::from_millis(10));
    }
    s.cancel(&job.id).unwrap();
    s.cancel(&job.id).unwrap();
    let result = wait(&s, &job.id);
    assert_eq!(result.state, JobState::Cancelled);
    s.shutdown();
    assert!(!s
        .root
        .join("temporary")
        .join(format!("{}.mp4", job.id))
        .exists());
    assert!(s.output_path(&job.id).is_err());
}
#[test]
fn rejects_bad_media_paths_archives_and_disk_failures() {
    let (d, s) = service();
    let bad = d.path().join("fake.mp3");
    fs::write(&bad, b"not audio").unwrap();
    assert!(s.import_media(&bad, "audio").is_err());
    assert!(s.media_path("../../secret").is_err());
    let huge = d.path().join("huge.mp3");
    fs::File::create(&huge)
        .unwrap()
        .set_len(AUDIO_LIMIT + 1)
        .unwrap();
    assert!(s.import_media(&huge, "audio").is_err());
    let zip = d.path().join("traversal.zip");
    let mut z = zip::ZipWriter::new(fs::File::create(&zip).unwrap());
    z.start_file("../escape", zip::write::SimpleFileOptions::default())
        .unwrap();
    use std::io::Write;
    z.write_all(b"bad").unwrap();
    z.finish().unwrap();
    assert!(s.prepare_archive(&zip).unwrap_err().contains("Unsafe"));
    assert!(!d.path().join("escape").exists());
    let (audio, art) = fixture(&s);
    fs::remove_file(s.root.join("catalog.json")).unwrap();
    fs::create_dir(s.root.join("catalog.json")).unwrap();
    assert!(s.start(request(&audio, &art)).is_err());
    assert!(!s.busy());
    assert!(s.snapshot().unwrap().catalog.jobs.is_empty());
}
#[test]
fn restart_marks_interrupted_and_keeps_immutable_media() {
    let (_d, s) = service();
    let (audio, art) = fixture(&s);
    let timestamp = now();
    let job = Job {
        id: id(),
        attempt: 1,
        settings: RenderSettings::default(),
        request: request(&audio, &art),
        audio: audio.clone(),
        artwork: art,
        state: JobState::Encoding,
        progress: 0.3,
        created_at: timestamp.clone(),
        updated_at: timestamp,
        error: None,
        output_bytes: None,
        output_sha256: None,
    };
    {
        let mut c = s.catalog.lock().unwrap();
        c.jobs.push(job.clone());
        s.save(&c).unwrap();
    }
    fs::write(s.root.join("temporary").join("owned.partial"), b"partial").unwrap();
    let reloaded = Service::open(s.root.clone(), s.ffmpeg.clone(), s.ffprobe.clone()).unwrap();
    let snapshot = reloaded.snapshot().unwrap();
    assert_eq!(snapshot.catalog.jobs[0].state, JobState::Interrupted);
    assert!(reloaded.media_path(&audio.id).is_ok());
    assert_eq!(
        fs::read_dir(reloaded.root.join("temporary"))
            .unwrap()
            .count(),
        0
    );
}

#[test]
fn relinks_only_exact_managed_versions_and_rejects_changed_originals() {
    let (d, s) = service();
    let (audio, art) = fixture(&s);
    let original =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/synthetic-tone.mp3");
    let managed = s.media_path(&audio.id).unwrap();
    fs::remove_file(&managed).unwrap();
    assert!(s.media_path(&audio.id).is_err());
    let restored = s.relink_media(&audio.id, &original).unwrap();
    assert_eq!(restored.id, audio.id);
    assert_eq!(s.snapshot().unwrap().catalog.media.len(), 2);
    assert_eq!(
        xasma_native::checksum(&s.media_path(&audio.id).unwrap()).unwrap(),
        audio.sha256
    );
    let changed = d.path().join("different.mp3");
    let mut bytes = fs::read(&original).unwrap();
    let middle = bytes.len() / 2;
    bytes[middle] ^= 1;
    fs::write(&changed, bytes).unwrap();
    assert!(s
        .relink_media(&audio.id, &changed)
        .unwrap_err()
        .contains("SHA-256"));
    assert_eq!(
        xasma_native::checksum(&s.media_path(&audio.id).unwrap()).unwrap(),
        audio.sha256
    );
    assert!(s.media_path(&art.id).is_ok());
}

#[test]
fn bounded_media_process_is_actually_killed_when_cancelled() {
    use std::sync::atomic::{AtomicBool, Ordering};
    let (a, _) = tools();
    let fixture =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/synthetic-tone.mp3");
    let flag = Arc::new(AtomicBool::new(false));
    let cancel = flag.clone();
    let setter = std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(200));
        cancel.store(true, Ordering::SeqCst);
    });
    let mut c = command(&a);
    c.args(["-v", "error", "-re", "-stream_loop", "60", "-i"])
        .arg(fixture)
        .args(["-f", "null", "-"]);
    let began = Instant::now();
    let error =
        xasma_native::media::run_bounded_with_cancel(c, Duration::from_secs(5), Some(&flag))
            .unwrap_err();
    setter.join().unwrap();
    assert!(error.contains("cancelled"), "{error}");
    assert!(began.elapsed() < Duration::from_secs(3));
}

#[cfg(windows)]
#[test]
fn desktop_data_lock_excludes_second_host_and_recovers_after_handle_close() {
    let root = tempfile::tempdir().unwrap();
    let first = xasma_native::exclusive_instance(root.path()).unwrap();
    assert!(xasma_native::exclusive_instance(root.path()).is_err());
    drop(first);
    let recovered = xasma_native::exclusive_instance(root.path()).unwrap();
    drop(recovered);
    assert!(root.path().join("instance.lock").exists());
}
