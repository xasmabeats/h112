fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }
    let sums = std::fs::read_to_string("resources/media-tools/SHA256SUMS").unwrap_or_default();
    for (file, var) in [
        ("ffmpeg.exe", "XASMA_FFMPEG_SHA256"),
        ("ffprobe.exe", "XASMA_FFPROBE_SHA256"),
    ] {
        let hash = sums
            .lines()
            .find_map(|line| {
                let mut parts = line.split_whitespace();
                let h = parts.next()?;
                if parts.next()? == file && h.len() == 64 {
                    Some(h)
                } else {
                    None
                }
            })
            .unwrap_or("");
        assert!(
            !hash.is_empty() || std::env::var("PROFILE").as_deref() != Ok("release"),
            "Verified media tools and SHA256SUMS must exist before release compilation"
        );
        println!("cargo:rustc-env={var}={hash}");
    }
    println!("cargo:rerun-if-changed=resources/media-tools/SHA256SUMS");
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "desktop_snapshot",
            "pick_media",
            "relink_media",
            "import_drop",
            "start_render",
            "cancel_render",
            "export_release",
            "save_video",
            "open_output_folder",
            "portable_backup",
            "prepare_restore",
            "promote_restore",
            "finish_restore",
            "create_recovery",
        ]),
    ))
    .expect("Tauri configuration/permission generation failed");
}
