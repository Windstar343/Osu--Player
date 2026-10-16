use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

pub struct DesktopPreferences {
    close_to_tray: AtomicBool,
    minimize_to_tray: AtomicBool,
}
impl Default for DesktopPreferences {
    fn default() -> Self {
        Self {
            close_to_tray: AtomicBool::new(true),
            minimize_to_tray: AtomicBool::new(false),
        }
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    close_to_tray: bool,
    minimize_to_tray: bool,
}
#[tauri::command]
pub fn set_desktop_preferences(state: tauri::State<DesktopPreferences>, preferences: Preferences) {
    state
        .close_to_tray
        .store(preferences.close_to_tray, Ordering::Relaxed);
    state
        .minimize_to_tray
        .store(preferences.minimize_to_tray, Ordering::Relaxed);
}
#[tauri::command]
pub fn minimize_player(
    window: tauri::WebviewWindow,
    state: tauri::State<DesktopPreferences>,
) -> Result<(), String> {
    if state.minimize_to_tray.load(Ordering::Relaxed) {
        window.hide()
    } else {
        window.minimize()
    }
    .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn toggle_fullscreen(window: tauri::WebviewWindow) -> Result<bool, String> {
    let next = !window.is_fullscreen().map_err(|e| e.to_string())?;
    window.set_fullscreen(next).map_err(|e| e.to_string())?;
    Ok(next)
}
#[tauri::command]
pub fn open_beatmap(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    if id <= 0 {
        return Err("This beatmap has no online page.".into());
    }
    app.opener()
        .open_url(format!("https://osu.ppy.sh/beatmapsets/{id}"), None::<&str>)
        .map_err(|e| e.to_string())
}
pub fn setup(app: &mut tauri::App) -> tauri::Result<()> {
    #[cfg(windows)]
    if let Some(window) = app.get_webview_window("main") {
        window.with_webview(|webview| unsafe {
            if let Ok(settings) = webview
                .controller()
                .CoreWebView2()
                .and_then(|core| core.Settings())
            {
                let _ = settings.SetAreDefaultContextMenusEnabled(false);
                let _ = settings.SetAreDevToolsEnabled(false);
            }
        })?;
    }
    let show = MenuItem::with_id(app, "show", "Open osu! Player", true, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle", "Play / Pause", true, None::<&str>)?;
    let next = MenuItem::with_id(app, "next", "Next song", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &toggle, &next, &quit])?;
    let mut tray = TrayIconBuilder::new()
        .tooltip("osu! Player")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            "show" => show_window(app),
            "toggle" | "next" => {
                let _ = app.emit("tray-action", event.id.as_ref());
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}
fn show_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
pub fn window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    let state = window.state::<DesktopPreferences>();
    match event {
        tauri::WindowEvent::CloseRequested { api, .. }
            if state.close_to_tray.load(Ordering::Relaxed) =>
        {
            if window.hide().is_ok() {
                api.prevent_close();
            }
        }
        tauri::WindowEvent::Resized(_) if state.minimize_to_tray.load(Ordering::Relaxed) => {
            if window.is_minimized().unwrap_or(false) {
                let _ = window.hide();
            }
        }
        _ => {}
    }
}
// Poll a light revision of library contents. Lazer's database is hashed because
// Windows can defer its modified timestamp while the game holds it open.
#[tauri::command]
pub async fn library_revision(
    sources: Vec<super::sources::LibrarySource>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut hash = Sha256::new();
        for source in sources.into_iter().filter(|s| s.enabled) {
            hash.update(source.kind.as_bytes());
            hash.update(source.folder.as_bytes());
            let selected = PathBuf::from(&source.folder);
            if source.kind == "lazer" {
                let path = selected.join("client.realm");
                match fs::read(&path) {
                    Ok(bytes) => hash.update(bytes),
                    Err(_) => hash.update(b"missing"),
                }
            } else {
                let root = if selected.join("Songs").is_dir() || selected.join("osu!.exe").is_file()
                {
                    super::configured_songs(&selected)
                        .into_iter()
                        .find(|p| p.is_dir())
                        .unwrap_or(selected)
                } else {
                    selected
                };
                for entry in walkdir::WalkDir::new(root)
                    .follow_links(false)
                    .sort_by_file_name()
                    .into_iter()
                    .flatten()
                {
                    if let Ok(metadata) = entry.metadata() {
                        hash.update(entry.path().to_string_lossy().as_bytes());
                        hash.update(metadata.len().to_le_bytes());
                        if let Ok(time) = metadata.modified().and_then(|t| {
                            t.duration_since(std::time::UNIX_EPOCH)
                                .map_err(std::io::Error::other)
                        }) {
                            hash.update(time.as_nanos().to_le_bytes());
                        }
                    }
                }
            }
        }
        format!("{:x}", hash.finalize())
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn refresh_revision_detects_stable_changes_and_lazer_content_with_same_length() {
        let root = std::env::temp_dir().join(format!("osu-revision-test-{}", std::process::id()));
        fs::create_dir_all(root.join("Songs")).unwrap();
        let stable = vec![super::super::sources::LibrarySource {
            kind: "stable".into(),
            folder: root.to_string_lossy().into(),
            enabled: true,
        }];
        let before = tauri::async_runtime::block_on(library_revision(stable.clone())).unwrap();
        fs::write(root.join("Songs/new.osu"), b"new beatmap").unwrap();
        let after = tauri::async_runtime::block_on(library_revision(stable)).unwrap();
        assert_ne!(before, after);
        fs::write(root.join("client.realm"), b"aaaa").unwrap();
        let lazer = vec![super::super::sources::LibrarySource {
            kind: "lazer".into(),
            folder: root.to_string_lossy().into(),
            enabled: true,
        }];
        let before = tauri::async_runtime::block_on(library_revision(lazer.clone())).unwrap();
        fs::write(root.join("client.realm"), b"bbbb").unwrap();
        let after = tauri::async_runtime::block_on(library_revision(lazer)).unwrap();
        assert_ne!(before, after);
        fs::remove_dir_all(root).unwrap();
    }
}

#[derive(Default)]
pub struct MiniWindow(
    std::sync::Mutex<Option<(tauri::PhysicalSize<u32>, tauri::PhysicalPosition<i32>, bool)>>,
);
#[tauri::command]
pub fn set_mini_player(
    window: tauri::WebviewWindow,
    state: tauri::State<MiniWindow>,
    enabled: bool,
    pinned: bool,
) -> Result<(), String> {
    let mut previous = state.0.lock().map_err(|e| e.to_string())?;
    let operation = || -> tauri::Result<()> {
        if enabled {
            if previous.is_none() {
                *previous = Some((
                    window.inner_size()?,
                    window.outer_position()?,
                    window.is_maximized()?,
                ));
                window.set_fullscreen(false)?;
                window.unmaximize()?;
                window.set_decorations(false)?;
                window.set_min_size(Some(tauri::LogicalSize::new(300.0, 280.0)))?;
                window.set_size(tauri::LogicalSize::new(380.0, 360.0))?;
            }
            window.set_always_on_top(pinned)?;
        } else if let Some((size, position, maximized)) = previous.take() {
            window.set_always_on_top(false)?;
            window.set_decorations(true)?;
            window.set_min_size(Some(tauri::LogicalSize::new(900.0, 640.0)))?;
            window.set_size(size)?;
            window.set_position(position)?;
            if maximized {
                window.maximize()?;
            }
        }
        Ok(())
    };
    let mut operation = operation;
    operation().map_err(|e| e.to_string())
}
#[tauri::command]
pub fn write_playlist_backup(path: PathBuf, content: String) -> Result<(), String> {
    if content.len() > 16 * 1024 * 1024 {
        return Err("Backup is too large.".into());
    }
    let value: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    if value["format"] != "osu-player-playlists" {
        return Err("Invalid backup format.".into());
    }
    fs::write(path, content).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn read_playlist_backup(path: PathBuf) -> Result<String, String> {
    use std::io::Read;
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut content = String::new();
    file.take(16 * 1024 * 1024 + 1)
        .read_to_string(&mut content)
        .map_err(|e| e.to_string())?;
    if content.len() > 16 * 1024 * 1024 {
        return Err("Backup is too large.".into());
    }
    Ok(content)
}

pub fn media_shortcuts() -> [(tauri_plugin_global_shortcut::Shortcut, &'static str); 4] {
    use tauri_plugin_global_shortcut::{Code, Shortcut};
    [
        (Shortcut::new(None, Code::MediaPlayPause), "toggle"),
        (Shortcut::new(None, Code::MediaTrackNext), "next"),
        (Shortcut::new(None, Code::MediaTrackPrevious), "previous"),
        (Shortcut::new(None, Code::MediaStop), "stop"),
    ]
}
#[tauri::command]
pub fn set_media_keys(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let shortcuts = media_shortcuts();
    for (shortcut, _) in &shortcuts {
        let _ = app.global_shortcut().unregister(*shortcut);
    }
    if enabled {
        for (shortcut, _) in &shortcuts {
            if let Err(error) = app.global_shortcut().register(*shortcut) {
                for (registered, _) in &shortcuts {
                    let _ = app.global_shortcut().unregister(*registered);
                }
                return Err(format!(
                    "Media keys are already reserved by another app: {error}"
                ));
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn close_player(window: tauri::WebviewWindow) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_player_frame(window: tauri::WebviewWindow, frameless: bool) -> Result<(), String> {
    window
        .set_decorations(!frameless)
        .map_err(|e| e.to_string())
}
