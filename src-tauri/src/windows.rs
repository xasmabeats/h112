use std::{
    collections::HashMap,
    fs::{self, File},
    io::Write,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{Emitter, Manager, State};
use xasma_native::{archive::PreparedRestore, model::*, Service};
struct Dropped(Mutex<HashMap<String, Vec<PathBuf>>>);
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T> + Send + 'static) -> Result<T> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}
fn confirm_overwrite(path: &std::path::Path) -> bool {
    !path.exists()
        || rfd::MessageDialog::new()
            .set_title("Replace existing file?")
            .set_description("The selected destination already exists. Replace it?")
            .set_buttons(rfd::MessageButtons::YesNo)
            .show()
            == rfd::MessageDialogResult::Yes
}
#[tauri::command]
fn desktop_snapshot(service: State<'_, Arc<Service>>) -> Result<Snapshot> {
    service.snapshot()
}
#[tauri::command]
async fn pick_media(service: State<'_, Arc<Service>>, kind: String) -> Result<Option<Media>> {
    let service = service.inner().clone();
    blocking(move || {
        let picker = rfd::FileDialog::new();
        let file = match kind.as_str() {
            "audio" => picker.add_filter("Audio", &["mp3", "wav"]).pick_file(),
            "artwork" => picker
                .add_filter("Artwork", &["png", "jpg", "jpeg"])
                .pick_file(),
            _ => return Err("Unknown media kind".into()),
        };
        file.map(|p| service.import_media(&p, &kind)).transpose()
    })
    .await
}
#[tauri::command]
async fn import_drop(
    service: State<'_, Arc<Service>>,
    dropped: State<'_, Dropped>,
    token: String,
) -> Result<Vec<Media>> {
    valid_id(&token)?;
    let paths = dropped
        .0
        .lock()
        .map_err(|_| "Drop lock failed")?
        .remove(&token)
        .ok_or("Drop expired; drop the files again")?;
    let service = service.inner().clone();
    blocking(move || {
        let mut imported = Vec::new();
        for path in paths {
            use std::io::Read;
            ensure_regular(&path)?;
            let mut head = [0; 16];
            let n = File::open(&path)
                .map_err(|e| e.to_string())?
                .read(&mut head)
                .map_err(|e| e.to_string())?;
            let (kind, _, _) = xasma_native::media::signature(&head[..n])?;
            imported.push(service.import_media(&path, kind)?);
        }
        Ok(imported)
    })
    .await
}
#[tauri::command]
fn start_render(service: State<'_, Arc<Service>>, request: RenderRequest) -> Result<Job> {
    service.inner().start(request)
}
#[tauri::command]
fn cancel_render(service: State<'_, Arc<Service>>, job_id: String) -> Result<()> {
    service.cancel(&job_id)
}
#[tauri::command]
async fn export_release(
    service: State<'_, Arc<Service>>,
    job_id: String,
) -> Result<Option<ExportRecord>> {
    let service = service.inner().clone();
    blocking(move || {
        rfd::FileDialog::new()
            .set_title("Choose release export folder")
            .pick_folder()
            .map(|p| service.export_to_folder(&job_id, &p))
            .transpose()
    })
    .await
}
#[tauri::command]
async fn save_video(
    service: State<'_, Arc<Service>>,
    job_id: String,
) -> Result<Option<ExportRecord>> {
    let service = service.inner().clone();
    blocking(move || {
        let source = service.output_path(&job_id)?;
        let job = service
            .catalog
            .lock()
            .map_err(|_| "Catalog lock failed")?
            .jobs
            .iter()
            .find(|j| j.id == job_id)
            .ok_or("Unknown job")?
            .clone();
        let Some(destination) = rfd::FileDialog::new()
            .add_filter("MP4 video", &["mp4"])
            .set_file_name(format!("{}.mp4", safe_name(&job.request.metadata.title)))
            .save_file()
        else {
            return Ok(None);
        };
        if !confirm_overwrite(&destination) {
            return Ok(None);
        }
        let temp = destination.with_file_name(format!(".xasma-{}.mp4.pending", id()));
        let result = (|| {
            let mut input = File::open(&source).map_err(|e| e.to_string())?;
            let mut output = File::create(&temp).map_err(|e| e.to_string())?;
            let bytes = std::io::copy(&mut input, &mut output)
                .and_then(|n| output.flush().and_then(|_| output.sync_all()).map(|_| n))
                .map_err(|e| e.to_string())?;
            if xasma_native::checksum(&temp)? != job.output_sha256.unwrap_or_default() {
                return Err("Output checksum mismatch; export cancelled".into());
            }
            fs::rename(&temp, &destination).map_err(|e| e.to_string())?;
            let record = ExportRecord {
                id: id(),
                job_id: job.id,
                release_id: job.request.release_id,
                beat_id: job.request.beat_id,
                created_at: now(),
                kind: "video".into(),
                destination_name: destination
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned(),
                bytes,
            };
            let mut c = service.catalog.lock().map_err(|_| "Catalog lock failed")?;
            let mut next = c.clone();
            next.exports.push(record.clone());
            service.save(&next)?;
            *c = next;
            Ok(Some(record))
        })();
        if result.is_err() {
            let _ = fs::remove_file(temp);
        }
        result
    })
    .await
}
#[tauri::command]
fn open_output_folder(service: State<'_, Arc<Service>>, job_id: String) -> Result<()> {
    let path = service.output_path(&job_id)?;
    let explorer = std::env::var_os("WINDIR")
        .map(PathBuf::from)
        .ok_or("Windows directory unavailable")?
        .join("explorer.exe");
    std::process::Command::new(explorer)
        .arg(format!("/select,{}", path.display()))
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
async fn portable_backup(service: State<'_, Arc<Service>>, metadata_json: String) -> Result<bool> {
    let service = service.inner().clone();
    blocking(move || {
        let Some(path) = rfd::FileDialog::new()
            .add_filter("XASMA portable backup", &["zip"])
            .set_file_name("xasma-portable.zip")
            .save_file()
        else {
            return Ok(false);
        };
        if !confirm_overwrite(&path) {
            return Ok(false);
        }
        service.portable_write(&metadata_json, &path, true)?;
        Ok(true)
    })
    .await
}
#[tauri::command]
async fn prepare_restore(service: State<'_, Arc<Service>>) -> Result<Option<PreparedRestore>> {
    let service = service.inner().clone();
    blocking(move || {
        rfd::FileDialog::new()
            .add_filter("XASMA portable backup", &["zip"])
            .pick_file()
            .map(|p| service.prepare_archive(&p))
            .transpose()
    })
    .await
}
#[tauri::command]
async fn promote_restore(service: State<'_, Arc<Service>>, transaction_id: String) -> Result<()> {
    let service = service.inner().clone();
    blocking(move || service.promote_archive(&transaction_id)).await
}
#[tauri::command]
fn finish_restore(service: State<'_, Arc<Service>>, transaction_id: String) -> Result<()> {
    service.finish_archive(&transaction_id)
}
#[tauri::command]
fn create_recovery(service: State<'_, Arc<Service>>, metadata_json: String) -> Result<String> {
    service.recovery(&metadata_json)
}

pub fn run() {
    let app=tauri::Builder::default().setup(|app|{
  let resources=app.path().resource_dir()?.join("media-tools");
  let (mut ffmpeg,mut ffprobe)=(resources.join("ffmpeg.exe"),resources.join("ffprobe.exe"));
  let expected=[env!("XASMA_FFMPEG_SHA256"),env!("XASMA_FFPROBE_SHA256")];
  if expected.iter().any(|pin|pin.is_empty()) {ffmpeg=resources.join("unverified-tools-disabled.exe");ffprobe=ffmpeg.clone();}
  else {for (path,pin) in [(&ffmpeg,expected[0]),(&ffprobe,expected[1])] {if xasma_native::checksum(path).as_deref()!=Ok(pin) {rfd::MessageDialog::new().set_title("XASMA tool integrity error").set_description("Bundled media tools failed verification. Reinstall the verified installer. No media tools were executed.").show();return Err(std::io::Error::other("Bundled tool checksum mismatch").into());}}}
  let service=Service::open(app.path().app_local_data_dir()?,ffmpeg,ffprobe).map_err(std::io::Error::other)?;
  app.manage(service);app.manage(Dropped(Mutex::new(HashMap::new())));Ok(())
 }).on_window_event(|window,event|{
  match event {
   tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop{paths,..})=>{
    if paths.is_empty()||paths.len()>2 {let _=window.emit("desktop-drop-error","Drop one audio file and/or one artwork file at a time");return;}
    let token=id();let state=window.state::<Dropped>();if let Ok(mut pending)=state.0.lock(){if pending.len()>=16{pending.clear();}pending.insert(token.clone(),paths.clone());let _=window.emit("desktop-drop",serde_json::json!({"token":token,"count":paths.len()}));};
   },
   tauri::WindowEvent::CloseRequested{api,..}=>{let service=window.state::<Arc<Service>>();if service.busy(){let decision=rfd::MessageDialog::new().set_title("Render in progress").set_description("Closing stops the active render and removes its partial output. Close and cancel?").set_buttons(rfd::MessageButtons::YesNo).show();if decision!=rfd::MessageDialogResult::Yes {api.prevent_close();return;}service.shutdown();}},
   _=>{}
  }
 }).invoke_handler(tauri::generate_handler![desktop_snapshot,pick_media,import_drop,start_render,cancel_render,export_release,save_video,open_output_folder,portable_backup,prepare_restore,promote_restore,finish_restore,create_recovery]).build(tauri::generate_context!()).expect("Failed to initialize XASMA desktop");
    app.run(|handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            handle.state::<Arc<Service>>().shutdown();
        }
    });
}
