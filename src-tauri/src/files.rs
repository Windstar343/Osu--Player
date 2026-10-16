use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::Manager;
fn audio_extension(path: &Path) -> bool {
    path.extension().and_then(|s| s.to_str()).is_some_and(|s| {
        matches!(
            s.to_ascii_lowercase().as_str(),
            "mp3" | "ogg" | "wav" | "flac" | "m4a" | "aac" | "opus" | "oga"
        )
    })
}
#[derive(Serialize)]
pub struct FileInfo {
    exists: bool,
    bytes: u64,
    format: String,
}
#[tauri::command]
pub fn audio_file_info(app: tauri::AppHandle, path: PathBuf) -> Result<FileInfo, String> {
    if !app.asset_protocol_scope().is_allowed(&path) {
        return Err("This file is outside your selected music locations.".into());
    }
    let metadata = path.metadata().ok().filter(|m| m.is_file());
    Ok(FileInfo {
        exists: metadata.is_some(),
        bytes: metadata.map(|m| m.len()).unwrap_or(0),
        format: path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .into(),
    })
}
#[tauri::command]
pub fn authorize_audio_file(app: tauri::AppHandle, path: PathBuf) -> Result<String, String> {
    let path = path
        .canonicalize()
        .map_err(|_| "This file could not be found.".to_string())?;
    if !path.is_file() || !audio_extension(&path) {
        return Err("Choose a supported audio file.".into());
    }
    app.asset_protocol_scope()
        .allow_file(&path)
        .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into())
}
#[tauri::command]
pub fn show_audio_file(app: tauri::AppHandle, path: PathBuf) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let path = path
        .canonicalize()
        .map_err(|_| "The audio file is missing.".to_string())?;
    if !app.asset_protocol_scope().is_allowed(&path) || !path.is_file() {
        return Err("This audio file is unavailable.".into());
    }
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|e| e.to_string())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_audio_files_can_be_relinked() {
        assert!(audio_extension(Path::new("song.MP3")));
        assert!(audio_extension(Path::new("track.flac")));
        assert!(!audio_extension(Path::new("notes.txt")));
        assert!(!audio_extension(Path::new("program.exe")));
    }
}
