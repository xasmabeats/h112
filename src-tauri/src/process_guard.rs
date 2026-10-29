//! Kernel-owned lifetime: Windows kills media subprocesses if the app exits,
//! including while a probe/import is running rather than an active render.
use crate::model::Result;
use std::process::Child;
#[cfg(windows)]
pub struct ProcessGuard(windows_sys::Win32::Foundation::HANDLE);
#[cfg(not(windows))]
pub struct ProcessGuard;
#[cfg(windows)]
impl Drop for ProcessGuard {
    fn drop(&mut self) {
        // SAFETY: this uniquely owned handle came from CreateJobObjectW. Closing it
        // once also enforces JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE for assigned children.
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}
pub fn track(child: &mut Child) -> Result<ProcessGuard> {
    #[cfg(not(windows))]
    {
        let _ = child;
        Ok(ProcessGuard)
    }
    #[cfg(windows)]
    {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::{Foundation::CloseHandle, System::JobObjects::*};
        // SAFETY: null security/name pointers request an unnamed, non-inheritable job.
        // The limit struct is initialized to zero, with only its documented flag set.
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                let _ = child.kill();
                let _ = child.wait();
                return Err(std::io::Error::last_os_error().to_string());
            }
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &limits as *const _ as *const std::ffi::c_void,
                std::mem::size_of_val(&limits) as u32,
            ) == 0
                || AssignProcessToJobObject(job, child.as_raw_handle()) == 0
            {
                let error = std::io::Error::last_os_error().to_string();
                CloseHandle(job);
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "Could not constrain media process lifetime: {error}"
                ));
            }
            Ok(ProcessGuard(job))
        }
    }
}

/// A kernel-held exclusive file handle prevents two desktop hosts from writing
/// the same catalog, including across Windows sessions. The file may remain
/// after a crash; the OS releases the handle, so no stale PID cleanup is needed.
#[cfg(windows)]
pub fn exclusive_instance(root: &std::path::Path) -> Result<std::fs::File> {
    use std::os::windows::fs::OpenOptionsExt;
    std::fs::create_dir_all(root).map_err(|e| e.to_string())?;
    std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .share_mode(0)
        .open(root.join("instance.lock"))
        .map_err(|e| format!("Cannot open the application data exclusively. Close other XASMA windows and retry. {e}"))
}
