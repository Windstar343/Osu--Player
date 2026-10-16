use super::{configured_songs, detect_libraries, scan, Scan, Track};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::Read,
    path::{Path, PathBuf},
    process::Command,
};
use tauri::Manager;

#[derive(Clone, Serialize, Deserialize)]
pub struct LibrarySource {
    pub kind: String,
    pub folder: String,
    #[serde(default)]
    pub enabled: bool,
}
#[derive(Serialize, Deserialize)]
pub struct CombinedScan {
    pub tracks: Vec<Track>,
    pub skipped: usize,
    pub warnings: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct CachedLibrary {
    revision: String,
    roots: Vec<PathBuf>,
    scan: CombinedScan,
}
fn cached_library(path: &Path, revision: &str) -> Option<CachedLibrary> {
    let saved: CachedLibrary = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
    let in_library = |path: &str| {
        PathBuf::from(path)
            .canonicalize()
            .ok()
            .is_some_and(|p| p.is_file() && saved.roots.iter().any(|root| p.starts_with(root)))
    };
    if saved.revision == revision
        && saved.scan.warnings.is_empty()
        && saved.roots.iter().all(|p| p.is_dir())
        && saved.scan.tracks.iter().all(|t| {
            in_library(&t.audio_path) && t.background_path.as_ref().is_none_or(|p| in_library(p))
        })
    {
        Some(saved)
    } else {
        None
    }
}

#[tauri::command]
pub async fn discover_sources() -> Result<Vec<LibrarySource>, String> {
    let mut result: Vec<_> = detect_libraries()
        .await?
        .into_iter()
        .map(|folder| LibrarySource {
            kind: "stable".into(),
            folder,
            enabled: true,
        })
        .collect();
    let mut candidates = Vec::new();
    for variable in ["APPDATA", "LOCALAPPDATA"] {
        if let Some(base) = std::env::var_os(variable) {
            for name in ["osu", "osu!lazer"] {
                candidates.push(PathBuf::from(&base).join(name));
            }
        }
    }
    let mut seen = HashSet::new();
    for candidate in candidates {
        // framework.ini can redirect lazer's storage to another drive.
        if let Ok(ini) = fs::read_to_string(candidate.join("framework.ini")) {
            for line in ini.lines() {
                if let Some((key, value)) = line.split_once('=') {
                    if matches!(key.trim(), "StoragePath" | "StorageDirectory")
                        && !value.trim().is_empty()
                    {
                        let path = PathBuf::from(value.trim());
                        candidates_from_config(
                            &mut result,
                            &mut seen,
                            if path.is_absolute() {
                                path
                            } else {
                                candidate.join(path)
                            },
                        );
                    }
                }
            }
        }
        candidates_from_config(&mut result, &mut seen, candidate);
    }
    Ok(result)
}
fn candidates_from_config(
    result: &mut Vec<LibrarySource>,
    seen: &mut HashSet<PathBuf>,
    candidate: PathBuf,
) {
    if candidate.join("client.realm").is_file() && candidate.join("files").is_dir() {
        if let Ok(path) = candidate.canonicalize() {
            if seen.insert(path.clone()) {
                result.push(LibrarySource {
                    kind: "lazer".into(),
                    folder: path.to_string_lossy().into(),
                    enabled: true,
                });
            }
        }
    }
}

fn read_lazer(root: &Path, cache: &Path) -> Result<Scan, String> {
    const READER: &[u8] = include_bytes!("../resources/lazer-reader/LazerReader.exe");
    let version = format!("{:x}", Sha256::digest(READER));
    let directory = cache.join("lazer-reader").join(&version[..16]);
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let executable = directory.join("LazerReader.exe");
    if !executable.is_file() {
        // Write then rename so an interrupted extraction cannot leave a partial executable.
        let temporary = directory.join(format!("reader-{}.tmp", std::process::id()));
        fs::write(&temporary, READER).map_err(|e| e.to_string())?;
        fs::rename(&temporary, &executable).map_err(|e| e.to_string())?;
    }
    let mut command = Command::new(executable);
    command.arg(root);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let output = command
        .output()
        .map_err(|e| format!("Could not start the lazer reader: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "Could not read osu!lazer: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    let mut result: Scan = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Invalid lazer library response: {e}"))?;
    // Validate every returned file against the selected library before making it playable.
    result.tracks.retain_mut(|track| {
        let Ok(audio) = PathBuf::from(&track.audio_path).canonicalize() else {
            return false;
        };
        if !audio.starts_with(root) || !audio.is_file() {
            return false;
        }
        track.audio_path = audio.to_string_lossy().into();
        track.id = track.audio_path.clone();
        track.background_path = track
            .background_path
            .as_ref()
            .and_then(|p| PathBuf::from(p).canonicalize().ok())
            .filter(|p| p.starts_with(root) && p.is_file())
            .map(|p| p.to_string_lossy().into());
        true
    });
    Ok(result)
}

fn fingerprint(path: &str) -> std::io::Result<String> {
    let mut file = fs::File::open(path)?;
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        let size = file.read(&mut buffer)?;
        if size == 0 {
            break;
        }
        hash.update(&buffer[..size]);
    }
    Ok(format!("{:x}", hash.finalize()))
}
fn merge_tracks(tracks: Vec<Track>, deduplicate: bool) -> Vec<Track> {
    let mut result: Vec<Track> = Vec::new();
    let mut seen: HashMap<String, usize> = HashMap::new();
    for track in tracks {
        let key = if deduplicate {
            fingerprint(&track.audio_path).unwrap_or_else(|_| track.id.clone())
        } else {
            track.id.clone()
        };
        if let Some(index) = seen.get(&key) {
            let existing = &mut result[*index];
            for mode in track.modes {
                if !existing.modes.contains(&mode) {
                    existing.modes.push(mode);
                }
            }
            if existing.beatmap_set_id.is_none() {
                existing.beatmap_set_id = track.beatmap_set_id;
            }
            for source in track.sources {
                if !existing.sources.contains(&source) {
                    existing.sources.push(source);
                }
            }
            if existing.background_path.is_none() {
                existing.background_path = track.background_path;
            }
        } else {
            seen.insert(key, result.len());
            result.push(track);
        }
    }
    result.sort_by_key(|t| (t.artist.to_lowercase(), t.title.to_lowercase()));
    result
}
#[tauri::command]
pub async fn scan_sources(
    app: tauri::AppHandle,
    sources: Vec<LibrarySource>,
) -> Result<CombinedScan, String> {
    let sources: Vec<_> = sources.into_iter().filter(|s| s.enabled).collect();
    if sources.is_empty() {
        return Err("Choose at least one music library.".into());
    }
    let cache = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    let revision = super::desktop::library_revision(sources.clone()).await?;
    tauri::async_runtime::spawn_blocking(move || {
        let signature = serde_json::to_vec(&sources).map_err(|e| e.to_string())?;
        let cache_file = cache.join(format!("library-v1-{:x}.json", Sha256::digest(&signature)));
        // Revalidate cached paths before restoring asset access.
        if let Some(saved) = cached_library(&cache_file, &revision) {
            for root in &saved.roots { app.asset_protocol_scope().allow_directory(root, true).map_err(|e| e.to_string())?; }
            return Ok(saved.scan);
        }
        let mut roots = Vec::new();
        let mut tracks = Vec::new();
        let mut warnings = Vec::new();
        let mut skipped = 0;
        let count = sources.len();
        for source in sources {
            let mut read = || -> Result<Scan, String> {
                let selected = PathBuf::from(&source.folder).canonicalize().map_err(|e| e.to_string())?;
                let root = match source.kind.as_str() {
                    "stable" => if selected.join("osu!.exe").is_file() || selected.join("Songs").is_dir() {
                        configured_songs(&selected).into_iter().find(|p| p.is_dir()).unwrap_or(selected)
                    } else { selected },
                    "lazer" => {
                        if !selected.join("client.realm").is_file() || !selected.join("files").is_dir() {
                            return Err("Choose the osu!lazer data folder containing client.realm and files.".into());
                        }
                        selected
                    },
                    _ => return Err("Unknown library type.".into()),
                }.canonicalize().map_err(|e| e.to_string())?;
                app.asset_protocol_scope().allow_directory(&root, true).map_err(|e| e.to_string())?;
                roots.push(root.clone());
                if source.kind == "lazer" {read_lazer(&root, &cache)} else {scan(root)}
            };
            match read() {
                Ok(result) => {tracks.extend(result.tracks); skipped += result.skipped;},
                Err(error) => warnings.push(format!("{} ({}): {}", if source.kind == "lazer" {"osu!lazer"} else {"osu! stable"}, source.folder, error)),
            }
        }
        if tracks.is_empty() && !warnings.is_empty() { return Err(warnings.join("\n")); }
        let saved = CachedLibrary { revision, roots, scan: CombinedScan {tracks:merge_tracks(tracks, count > 1), skipped, warnings} };
        if saved.scan.warnings.is_empty() {
            let _ = fs::create_dir_all(&cache);
            if let Ok(bytes) = serde_json::to_vec(&saved) {
                let temporary = cache_file.with_extension("tmp");
                if fs::write(&temporary, bytes).is_ok() { let _ = fs::rename(&temporary, &cache_file); }
            }
        }
        Ok(saved.scan)
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn metadata_cache_reuses_only_current_existing_library_files() {
        let root = std::env::temp_dir().join(format!("osu-cache-test-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let root = root.canonicalize().unwrap();
        let audio = root.join("song.mp3");
        fs::write(&audio, b"fixture").unwrap();
        let file = root.join("cache.json");
        let cached = CachedLibrary {
            revision: "current".into(),
            roots: vec![root.clone()],
            scan: CombinedScan {
                tracks: vec![Track {
                    id: "song".into(),
                    title: "Song".into(),
                    artist: "Artist".into(),
                    creator: "Mapper".into(),
                    audio_path: audio.to_string_lossy().into(),
                    background_path: None,
                    sources: vec!["stable".into()],
                    modes: vec![0],
                    beatmap_set_id: None,
                }],
                skipped: 0,
                warnings: vec![],
            },
        };
        fs::write(&file, serde_json::to_vec(&cached).unwrap()).unwrap();
        assert_eq!(
            cached_library(&file, "current").unwrap().scan.tracks.len(),
            1
        );
        assert!(cached_library(&file, "changed").is_none());
        fs::remove_file(audio).unwrap();
        assert!(cached_library(&file, "current").is_none());
        fs::write(&file, b"interrupted cache").unwrap();
        assert!(cached_library(&file, "current").is_none());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn merges_identical_audio_across_sources_and_keeps_source_labels() {
        let root = std::env::temp_dir().join(format!("osu-merge-test-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let make = |name: &str, source: &str, bytes: &[u8]| {
            let path = root.join(name);
            fs::write(&path, bytes).unwrap();
            Track {
                id: name.into(),
                title: name.into(),
                artist: "Artist".into(),
                creator: "Mapper".into(),
                audio_path: path.to_string_lossy().into(),
                background_path: None,
                sources: vec![source.into()],
                modes: vec![0],
                beatmap_set_id: None,
            }
        };
        let result = merge_tracks(
            vec![
                make("stable.mp3", "stable", b"same audio"),
                make("lazer.mp3", "lazer", b"same audio"),
                make("other.mp3", "lazer", b"different audio"),
            ],
            true,
        );
        assert_eq!(result.len(), 2);
        assert_eq!(
            result
                .iter()
                .find(|t| t.id == "stable.mp3")
                .unwrap()
                .sources,
            vec!["stable", "lazer"]
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    #[ignore = "Requires OSU_PLAYER_STABLE_TEST and OSU_PLAYER_LAZER_TEST local library paths"]
    fn installed_libraries_resolve_real_audio_and_artwork() {
        let stable_root = PathBuf::from(std::env::var("OSU_PLAYER_STABLE_TEST").unwrap())
            .canonicalize()
            .unwrap();
        let lazer_root = PathBuf::from(std::env::var("OSU_PLAYER_LAZER_TEST").unwrap())
            .canonicalize()
            .unwrap();
        let cache =
            std::env::temp_dir().join(format!("osu-lazer-integration-{}", std::process::id()));
        let stable = scan(stable_root).unwrap();
        let lazer = read_lazer(&lazer_root, &cache).unwrap();
        assert!(!stable.tracks.is_empty());
        assert!(!lazer.tracks.is_empty());
        assert!(lazer
            .tracks
            .iter()
            .all(|t| Path::new(&t.audio_path).is_file()));
        assert!(lazer.tracks.iter().any(|t| t.background_path.is_some()));
        let stable_count = stable.tracks.len();
        let lazer_count = lazer.tracks.len();
        let merged = merge_tracks(
            stable.tracks.into_iter().chain(lazer.tracks).collect(),
            true,
        );
        assert!(merged.len() >= stable_count.max(lazer_count));
        assert!(merged.len() <= stable_count + lazer_count);
        println!(
            "stable={stable_count}, lazer={lazer_count}, combined={}",
            merged.len()
        );
        fs::remove_dir_all(cache).unwrap();
    }
}
