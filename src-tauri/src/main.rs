#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
mod desktop;
mod discord;
#[cfg(windows)]
mod discord_pipe;
mod sources;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};
use tauri::Manager;
use walkdir::WalkDir;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Track {
    id: String,
    title: String,
    artist: String,
    creator: String,
    audio_path: String,
    background_path: Option<String>,
    #[serde(default)]
    sources: Vec<String>,
    #[serde(default)]
    modes: Vec<u8>,
    #[serde(default)]
    beatmap_set_id: Option<i64>,
}
#[derive(Serialize, Deserialize)]
struct Scan {
    tracks: Vec<Track>,
    skipped: usize,
}

fn safe_file(folder: &Path, name: &str, root: &Path) -> Option<PathBuf> {
    let path = folder
        .join(name.trim().trim_matches('"'))
        .canonicalize()
        .ok()?;
    if path.starts_with(root) && path.is_file() {
        Some(path)
    } else {
        None
    }
}

fn scan(root: PathBuf) -> Result<Scan, String> {
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    if !root.is_dir() {
        return Err("Choose your osu! Songs folder.".into());
    }
    let mut tracks: Vec<Track> = Vec::new();
    let mut seen = HashSet::new();
    let mut skipped = 0;
    for entry in WalkDir::new(&root).follow_links(false) {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => {
                skipped += 1;
                continue;
            }
        };
        if !entry.file_type().is_file()
            || entry.path().extension().and_then(|x| x.to_str()) != Some("osu")
        {
            continue;
        }
        let bytes = match fs::read(entry.path()) {
            Ok(b) => b,
            Err(_) => {
                skipped += 1;
                continue;
            }
        };
        let text = String::from_utf8_lossy(&bytes);
        let (mut title, mut artist, mut creator, mut audio, mut background) = (
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            None,
        );
        let mut mode = 0u8;
        let mut beatmap_set_id = None;
        let mut section = "";
        for line in text.lines() {
            let line = line.trim().trim_start_matches('\u{feff}');
            if line.starts_with('[') {
                section = line;
                continue;
            }
            if section == "[General]" || section == "[Metadata]" {
                if let Some((key, value)) = line.split_once(':') {
                    let value = value.trim().to_string();
                    match (section, key.trim()) {
                        ("[General]", "AudioFilename") => audio = value,
                        ("[Metadata]", "Title") => title = value,
                        ("[Metadata]", "Artist") => artist = value,
                        ("[Metadata]", "Creator") => creator = value,
                        ("[General]", "Mode") => mode = value.parse().unwrap_or(0),
                        ("[Metadata]", "BeatmapSetID") => {
                            beatmap_set_id = value.parse::<i64>().ok().filter(|id| *id > 0)
                        }
                        _ => {}
                    }
                }
            }
            if section == "[Events]" {
                let mut parts = line.splitn(3, ',');
                if matches!(parts.next(), Some("0") | Some("Background"))
                    && parts.next() == Some("0")
                {
                    if let Some(rest) = parts.next() {
                        background = if rest.starts_with('"') {
                            rest[1..].split('"').next().map(str::to_string)
                        } else {
                            rest.split(',').next().map(str::to_string)
                        };
                    }
                }
            }
        }
        let folder = entry.path().parent().unwrap();
        let audio_path = match safe_file(folder, &audio, &root) {
            Some(p) if !audio.is_empty() => p,
            _ => {
                skipped += 1;
                continue;
            }
        };
        let id = audio_path.to_string_lossy().to_string();
        if !seen.insert(id.clone()) {
            if let Some(existing) = tracks.iter_mut().find(|t| t.id == id) {
                if !existing.modes.contains(&mode) {
                    existing.modes.push(mode);
                }
                if existing.beatmap_set_id.is_none() {
                    existing.beatmap_set_id = beatmap_set_id;
                }
            }
            continue;
        }
        let background_path = background
            .and_then(|b| safe_file(folder, &b, &root))
            .map(|p| p.to_string_lossy().to_string());
        tracks.push(Track {
            id: id.clone(),
            title: if title.is_empty() {
                audio.clone()
            } else {
                title
            },
            artist: if artist.is_empty() {
                "Unknown artist".into()
            } else {
                artist
            },
            creator,
            audio_path: id,
            background_path,
            sources: vec!["stable".into()],
            modes: vec![mode],
            beatmap_set_id,
        });
    }
    tracks.sort_by_key(|t| (t.artist.to_lowercase(), t.title.to_lowercase()));
    Ok(Scan { tracks, skipped })
}

#[tauri::command]
async fn scan_library(app: tauri::AppHandle, folder: String) -> Result<Scan, String> {
    let selected = PathBuf::from(folder)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let root = if selected.join("osu!.exe").is_file() || selected.join("Songs").is_dir() {
        configured_songs(&selected)
            .into_iter()
            .find(|p| p.is_dir())
            .unwrap_or(selected)
    } else {
        selected
    };
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    // Scope is granted only for the library being imported, never the entire drive.
    app.asset_protocol_scope()
        .allow_directory(&root, true)
        .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || scan(root))
        .await
        .map_err(|e| e.to_string())?
}

fn configured_songs(install: &Path) -> Vec<PathBuf> {
    let mut folders = Vec::new();
    if let Ok(entries) = fs::read_dir(install) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("osu!.") && name.ends_with(".cfg") {
                if let Ok(text) = fs::read_to_string(entry.path()) {
                    for line in text.lines() {
                        if let Some((key, value)) = line.split_once('=') {
                            if key.trim() == "BeatmapDirectory" {
                                let path = PathBuf::from(value.trim().trim_matches('"'));
                                folders.push(if path.is_absolute() {
                                    path
                                } else {
                                    install.join(path)
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    folders.push(install.join("Songs"));
    folders
}

#[tauri::command]
async fn detect_libraries() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut installs = Vec::new();
        for variable in [
            "LOCALAPPDATA",
            "APPDATA",
            "ProgramFiles",
            "ProgramFiles(x86)",
        ] {
            if let Some(base) = std::env::var_os(variable) {
                installs.push(PathBuf::from(base).join("osu!"));
            }
        }
        for drive in b'C'..=b'Z' {
            for relative in ["osu!", "Games\\osu!"] {
                installs.push(PathBuf::from(format!("{}:\\{}", drive as char, relative)));
            }
        }
        #[cfg(windows)]
        for hive in [
            winreg::enums::HKEY_CURRENT_USER,
            winreg::enums::HKEY_LOCAL_MACHINE,
        ] {
            let registry = winreg::RegKey::predef(hive);
            for key_name in [
                "Software\\Classes\\osu\\shell\\open\\command",
                "Software\\Classes\\osu!\\shell\\open\\command",
            ] {
                if let Ok(key) = registry.open_subkey(key_name) {
                    if let Ok(command) = key.get_value::<String, _>("") {
                        let exe = if command.starts_with('"') {
                            command[1..].split('"').next().unwrap_or("")
                        } else {
                            command.split("osu!.exe").next().unwrap_or("")
                        };
                        let executable = if command.starts_with('"') {
                            PathBuf::from(exe)
                        } else {
                            PathBuf::from(format!("{}osu!.exe", exe))
                        };
                        if let Some(parent) = executable.parent() {
                            installs.push(parent.to_path_buf());
                        }
                    }
                }
            }
        }
        let mut seen = HashSet::new();
        let mut libraries = Vec::new();
        for install in installs {
            for folder in configured_songs(&install) {
                if let Ok(folder) = folder.canonicalize() {
                    if folder.is_dir() && seen.insert(folder.clone()) {
                        libraries.push(folder.to_string_lossy().to_string());
                    }
                }
            }
        }
        libraries
    })
    .await
    .map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    use tauri::Emitter;
                    if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        if let Some((_, action)) = desktop::media_shortcuts()
                            .iter()
                            .find(|(key, _)| key == shortcut)
                        {
                            let _ = app.emit("tray-action", *action);
                        }
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(desktop::DesktopPreferences::default())
        .manage(desktop::MiniWindow::default())
        .manage(discord::DiscordPresence::default())
        .setup(|app| {
            desktop::setup(app)?;
            Ok(())
        })
        .on_window_event(desktop::window_event)
        .invoke_handler(tauri::generate_handler![
            scan_library,
            detect_libraries,
            sources::discover_sources,
            sources::scan_sources,
            desktop::set_desktop_preferences,
            desktop::minimize_player,
            desktop::toggle_fullscreen,
            desktop::set_mini_player,
            desktop::close_player,
            desktop::set_player_frame,
            desktop::set_media_keys,
            desktop::write_playlist_backup,
            desktop::read_playlist_backup,
            desktop::open_beatmap,
            desktop::library_revision,
            discord::update_discord,
            discord::discord_status
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start osu! Player");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn library_reads_metadata_groups_difficulties_and_blocks_escape() {
        let root = std::env::temp_dir().join(format!("osu-player-test-{}", std::process::id()));
        fs::create_dir_all(root.join("Songs/map")).unwrap();
        fs::write(root.join("Songs/map/song.mp3"), b"fixture").unwrap();
        fs::write(root.join("Songs/map/art.jpg"), b"fixture").unwrap();
        fs::write(root.join("outside.mp3"), b"fixture").unwrap();
        let metadata = "[General]\nAudioFilename: song.mp3\n[Metadata]\nTitle: A song: with a colon\nArtist: Example\nCreator: Mapper\n[Events]\n0,0,\"art.jpg\",0,0\n[TimingPoints]\n0,500,4,2,0,100,1,0\n1000,-50,4,2,0,100,0,0\n2000,400,3,2,0,100,1,0\n";
        fs::write(root.join("Songs/map/easy.osu"), metadata).unwrap();
        fs::write(
            root.join("Songs/map/hard.osu"),
            metadata
                .replace(
                    "AudioFilename: song.mp3",
                    "AudioFilename: song.mp3\nMode: 3",
                )
                .replace("Creator: Mapper", "Creator: Mapper\nBeatmapSetID: 123"),
        )
        .unwrap();
        fs::write(
            root.join("Songs/map/escape.osu"),
            "[General]\nAudioFilename: ../../outside.mp3",
        )
        .unwrap();
        let result = scan(root.join("Songs")).unwrap();
        assert_eq!(result.tracks.len(), 1);
        assert_eq!(result.skipped, 1);
        assert!(result.tracks[0].modes.contains(&0) && result.tracks[0].modes.contains(&3));
        assert_eq!(result.tracks[0].beatmap_set_id, Some(123));
        assert_eq!(result.tracks[0].title, "A song: with a colon");
        assert_eq!(result.tracks[0].artist, "Example");
        assert!(result.tracks[0]
            .background_path
            .as_ref()
            .unwrap()
            .ends_with("art.jpg"));
        fs::write(root.join("osu!.test.cfg"), "BeatmapDirectory = Songs").unwrap();
        assert_eq!(configured_songs(&root)[0], root.join("Songs"));
        fs::remove_dir_all(&root).unwrap();
    }
}
