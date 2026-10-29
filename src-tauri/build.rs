#[path = "src/tool_checksums.rs"]
mod tool_checksums;
fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }
    let sums = std::fs::read_to_string("resources/media-tools/SHA256SUMS").unwrap_or_default();
    for (file, var) in [
        ("ffmpeg.exe", "XASMA_FFMPEG_SHA256"),
        ("ffprobe.exe", "XASMA_FFPROBE_SHA256"),
    ] {
        let parsed = tool_checksums::tool_checksum(&sums, file);
        if std::env::var("PROFILE").as_deref() == Ok("release") {
            assert!(
                parsed.is_ok(),
                "Verified media tools required: {}",
                parsed.as_ref().unwrap_err()
            );
        }
        let hash = parsed.unwrap_or_default();
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
