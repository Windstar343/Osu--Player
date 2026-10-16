# osu! Player

A Windows desktop music player for downloaded **osu! stable and osu!lazer** beatmaps.

## Use
Double-click **Osu! Player.exe**. It opens its own desktop window without a browser or web server.

On first launch, choose **osu! stable**, **osu!lazer**, or both using the source checkboxes. Detected library folders are filled automatically; use Browse/Change for custom locations. Click **Start listening** to save the selection. Reopen **Music sources** in the sidebar to change it later. Existing users see this setup once after upgrading.

Stable detection checks common install folders, osu! protocol registrations, and the BeatmapDirectory configuration setting. Lazer detection checks its usual data folders and configured storage redirects. For lazer, select the data folder containing **client.realm** and **files**, rather than the application install folder.

The player reads song titles, artists, mappers, audio, and background artwork locally. Difficulties sharing audio are grouped. When combining libraries, identical audio content appears once with both source badges. Search, favorites, seek, volume, shuffle, and repeat-one are included. Source selections, favorites, and volume are saved locally.

Lazer's Realm database is opened **read-only**; no export, account, network connection, or database migration is required. The game library is not edited. Files deleted or not downloaded locally cannot be played. Unopened .osz archives are not supported. Audio format support depends on Windows WebView2.

## Develop
Build requirements: Node.js LTS with npm, Rust (MSVC), Visual Studio C++ desktop tools with a Windows SDK, **.NET 10 SDK**, and WebView2.
Official Tauri prerequisites: https://tauri.app/start/prerequisites/

```powershell
npm install
npm run tauri dev
```

The .NET reader is published as a self-contained single file and embedded in the Rust executable. Users do not need to install .NET. At runtime it is extracted into this app's cache and invoked without a console window. Development/build commands publish the reader before compiling the app.

Build an executable into this folder:
```powershell
powershell -ExecutionPolicy Bypass -File .\Build-Desktop.ps1
```
Add `-Release` for an optimized build. Close the running player before replacing the executable.

Build a Windows installer:
```powershell
npm run tauri build
```
Installer output: src-tauri/target/release/bundle/nsis/.

## Validate
```powershell
npm run desktop:build
cargo test --manifest-path src-tauri/Cargo.toml --features custom-protocol
```
Tests cover metadata, artwork paths, difficulty grouping, preventing files outside the selected root, configured song folders, and grouping identical audio across sources.

Optional test against installed libraries:
```powershell
$env:OSU_PLAYER_STABLE_TEST = 'C:\path\to\osu!\Songs'
$env:OSU_PLAYER_LAZER_TEST = 'C:\path\to\osu'
cargo test --manifest-path src-tauri/Cargo.toml --features custom-protocol installed_libraries -- --ignored --nocapture
```

## Player features

- Playlists: create, rename, delete, add/remove songs, and reorder tracks. Missing songs remain in a playlist when their source library is turned off.
- Playlist playback follows the chosen order; shuffle and repeat-one are available.
- Expand Now Playing using the artwork in the bottom bar or the expand button at the top. It includes large artwork, an ambient background, favorites, and playlist actions. Use Back to library or Escape to return. The full-screen button expands the native window.
- Filter downloaded songs by source, game mode, and mapper, or use search. Beatmaps with a published set ID have a button for their online page.
- Settings includes automatic refresh (15 seconds to 5 minutes), manual refresh, source selection, tray behavior, compact song rows, and reduced motion.
- Audio options: 0.5×–2× pitch-preserving speed, a five-band EQ with presets, and a compressor to reduce loud peaks. Peak reduction is not per-song loudness normalization.
- Close-to-tray is enabled by default. Right-click the system tray icon for Open, Play/Pause, Next, and Quit. Minimize-to-tray is optional in Settings. Space toggles playback when not typing.

Automatic refresh checks file metadata for stable and hashes lazer's small local database, then rescans only when the revision changes. Refresh does not restart a song that is still present. It can take one check interval for new downloads to appear.

Playlists, settings, favorites, source choices, and volume are saved in the app's local WebView storage.

Source code is available under the MIT license.

## Playback modes

- **Normal:** original speed and pitch.
- **DT (Double Time):** 1.5×, preserving the original pitch.
- **NC (Nightcore):** 1.5× resampling with higher pitch. Plays the song only; no added percussion.
- **Custom:** 0.5×–2× with original pitch.

Modes are available beside the volume control, in Now Playing, and in Settings. Switching modes keeps the song's position. Displayed playback time reflects the selected rate. Mode switches use a short gain fade and do not reset the song position.

## Code and verification

Playback views, the audio engine, library loading, source setup, and settings are separate modules. The native Rust code handles file access, source reading, tray behavior, and library revisions. UI components do not modify beatmap files.

```powershell
npm run format:check
npm run test:ui
```

The UI tests use the installed Microsoft Edge in headless mode and generated audio fixtures. They verify playlist operations, filtering, background refresh, actual pitch measured from a 440 Hz reference tone (440 Hz for DT and 660 Hz for NC), absence of generated percussion, Web Audio EQ, Discord opt-in/clearing, and persistence. They mock native IPC; Rust tests cover metadata reading, duplicate merging, root boundaries, revision detection, Discord IPC acknowledgements, and connection timeouts using an isolated local named pipe. No test activity is published to a Discord account. Installed-library tests are run separately as described above.

The design target is a focused local music player: predictable playback, both osu! libraries, readable controls, and maintainable code. The project is not affiliated with osu! or Founntain/osuplayer. Feature comparisons are a reference, not a claim of overall superiority.


## Discord Rich Presence

In **Settings → Discord**, enable **Show current song on Discord**. It is off by default. The Discord desktop app must be running, with activity sharing enabled in Discord.

This source distribution does not include a developer-specific Discord Application ID. To enable Rich Presence in your own build, set the `OSU_PLAYER_DISCORD_APP_ID` environment variable to your public Discord Application ID before compiling. No bot token, password, or account login is needed. Builds without an ID keep Discord sharing unavailable. It shares song title, artist, playback mode, playback timing, and a public beatmap cover where available. Local artwork is not uploaded. Pausing, disabling sharing, or quitting clears the activity. The worker reconnects when Discord restarts; Settings shows connection status.

Rich Presence registration, application name, and its default icon are managed in Discord's Developer Portal. The supplied logo is used locally in the app and executable; it does not change the registered Discord application's assets.


## Queue, mini-player, and session

- Open **Queue** from the top toolbar. Use a song's queue menu for **Play next** or **Add to queue**. Drag queue entries or use their arrow buttons to reorder them. Duplicate entries are supported; removing an entry never removes the song file. Clear queue keeps the currently playing song.
- The music-note button in the top toolbar opens the **mini-player**. Its pin toggles always-on-top; the expand button restores the full window and its previous bounds. Playback uses the same audio engine in both views.
- **Settings → Window & appearance → Remember playback session** saves the current song, position, queue, shuffle, and repeat. Relaunch restores it **paused**. Disabling the setting deletes the saved session. Missing queue entries are omitted when restoring.
- **Windows media controls** registers native global play/pause, next, previous, and stop keys. Media Session metadata and actions are also supplied for compatible Windows controls and headsets. If another application has reserved the keys, a message is shown and native registration is rolled back. Disable the setting to release the keys.

## Transitions and backups

**Settings → Audio** includes preloaded gapless transitions and crossfade (off, 1, 2, 3, 5, 8, or 10 seconds). The next track is prepared in a second media decoder. Crossfade uses per-deck gain automation and both decks share the EQ, peak reduction, and master volume. Pause, seek, or manually changing a song cancels an overlap. All playback modes apply to both decks. These transitions minimize gaps but are **not guaranteed sample-accurate gapless playback**; decoder delay, codec padding, and system scheduling can still affect a transition.

**Settings → Playlist backup** exports or imports a versioned JSON file through a native file dialog. Imports add copies without overwriting existing playlists. Tracks match their current IDs first, then title/artist and beatmap set ID when available. Ambiguous or unavailable tracks retain their original references. Audio and artwork are not included in backups.

Library scan results are cached on disk by selected sources and their revision. A warm load skips beatmap parsing, the lazer reader, and duplicate audio hashing. Changed revisions, missing files, scan warnings, or invalid cache data trigger a fresh scan. Song and queue lists render only the visible rows plus a small buffer, so long libraries do not create thousands of controls at once.

Additional verification covers queue insertion, duplicate references, arrows and drag ordering, paused session restoration, native mini-player invocation and small-window layout, two-deck crossfade, preloaded transitions, playlist backup matching/validation, media-control settings, and a 10,003-song library. Native tests verify cache reuse and invalidation. Hardware media-key behavior and perceived transition quality should also be checked on the target PC.


## Browsing and appearance

Switch between **List view** and **Artwork grid view** beside the collection heading. Both use the same search, source, mode, and mapper filters. The grid keeps play, favorite, playlist, and queue actions available. The layout and sidebar collapse choice are saved locally. The sidebar toggle is in the top toolbar.

**Settings → Window & appearance → Accent color** defaults to extracting a readable accent from the current artwork. Choose **Fixed pink** for a consistent theme. Missing or unreadable artwork falls back to pink. Artwork is sampled locally and never uploaded. Source and mode badges in list rows appear on hover or keyboard focus; they remain visible in Now Playing details.

Mini-player controls fade after the pointer leaves, and reappear on hover or keyboard focus. Open menus stay visible; touch devices keep their controls visible. Reduced motion also disables the fade animation.

## Quick search and sleep timer

Press **Ctrl+K** or use the search button above the bottom player bar to search the entire selected library, including from Now Playing or mini mode. Use Up/Down and Enter to choose a song; Escape closes search. The first 60 matches are shown; type more to narrow large results. Playback queues the matching results.

The adjacent **timer** button pauses after 15, 30, 45, 60, or 90 minutes, or at the end of the current song. End-of-song mode suppresses crossfade, repeat, and automatic advancement for that ending. Cancel the timer from the same menu. Timers last for the current app session and use elapsed wall time; they do not shut down the PC.


## Downloadable Windows builds

Maintainers can run **Actions → Build Windows app → Run workflow**. The completed run provides an `osu-player-windows` artifact with the executable and license. These builds run on GitHub's machines and remap source paths; do not upload local debug executables as releases.


## Version 0.2: file recovery and desktop behavior

Browser context menus and browser shortcuts (including F12, inspect, print, save, and reload) are disabled in the app. Release builds do not enable developer tools. Right-click a song or use its information button to open **Song details** instead. Source code remains editable for contributors.

Song details includes title, artist, mapper, library, game modes, audio file location, format, file size, and availability. **Show in folder** reveals available audio in Explorer. **Locate audio file** reconnects a moved song while keeping its existing favorite/playlist ID. Use Music sources and Refresh library to reconnect an entire moved library.

Previously scanned songs that are no longer available appear in **Unavailable songs**. Their metadata and relinked audio locations stay in local storage on the user's PC, and are never part of a release. An unavailable song in a playlist opens recovery details rather than attempting playback. Catalogs are local to the installation; the app cannot recover metadata for files it has never seen.

GitHub-built releases provide an installer, a portable executable, and SHA-256 checksums. No local debug executable, cache, music library, or developer configuration is bundled. Discord remains opt-in and requires a maintainer-supplied application ID at build time.
