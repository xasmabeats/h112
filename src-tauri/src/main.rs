#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#[cfg(windows)]
mod windows;
fn main() {
    #[cfg(windows)]
    windows::run();
    #[cfg(not(windows))]
    eprintln!("The desktop GUI targets Windows x64. Use cargo test for the portable native core or npm run dev for the web app.");
}
