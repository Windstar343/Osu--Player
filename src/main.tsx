import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Music2,
  Library,
  Heart,
  FolderPlus,
  Search,
  Play,
  Disc3,
  Settings as SettingsIcon,
  ListMusic,
  Plus,
  X,
  ArrowUp,
  ArrowDown,
  Trash2,
  Pencil,
  Maximize2,
  Minus,
  ExternalLink,
  RefreshCw,
  SlidersHorizontal,
  LayoutGrid,
  List,
  PanelLeft,
  Info,
  FileWarning,
} from "lucide-react";
import {
  Track,
  Playlist,
  Settings,
  defaultSettings,
  stored,
  persist,
  modes,
} from "./model";
import { useLibrary } from "./useLibrary";
import { useAudio } from "./useAudio";
import { SourcesDialog } from "./SourcesDialog";
import { SettingsView } from "./SettingsView";
import { Cover, PlayerBar, NowPlaying } from "./PlayerViews";
import { Logo } from "./Logo";
import { useDiscord } from "./useDiscord";
import "./style.css";
import { SongDetails } from "./SongDetails";
import { ArtworkGrid } from "./ArtworkGrid";
import { useArtworkTheme } from "./useArtworkTheme";
import { QuickSearch } from "./QuickSearch";
import { useSleepTimer, SleepTimerControl } from "./SleepTimer";
import type { Player } from "./useAudio";
import { QueueView } from "./QueueView";
import { MiniPlayer } from "./MiniPlayer";
import { VirtualRows } from "./VirtualRows";
import { useMediaKeys } from "./useMediaKeys";
import { exportPlaylists, importPlaylists } from "./playlistBackup";

function App() {
  const lib = useLibrary();
  const [layout, setLayout] = useState<"list" | "grid">(() =>
    stored("libraryLayout", "list"),
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    stored("sidebarCollapsed", false),
  );
  useEffect(() => persist("libraryLayout", layout), [layout]);
  useEffect(
    () => persist("sidebarCollapsed", sidebarCollapsed),
    [sidebarCollapsed],
  );
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = stored<Partial<Settings>>("settingsV1", {});
    return {
      ...defaultSettings,
      ...saved,
      playbackMode:
        saved.playbackMode ||
        (saved.speed && saved.speed !== 1 ? "custom" : "normal"),
    };
  });
  const [favorites, setFavorites] = useState<string[]>(() =>
    stored("favorites", []),
  );
  const [playlists, setPlaylists] = useState<Playlist[]>(() =>
    stored("playlistsV1", []),
  );
  const [view, setView] = useState("library");
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");
  const [mapperFilter, setMapperFilter] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [mini, setMini] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [dialogState, setDialogState] = useState<{
    kind: "create" | "rename" | "delete" | "add";
    playlistId?: string;
    trackId?: string;
  } | null>(null);
  const [playlistName, setPlaylistName] = useState("");
  const [playlistError, setPlaylistError] = useState("");
  const playlistDialog = useRef<HTMLDialogElement>(null);
  const sleepPlayer = useRef<Player | null>(null);
  const sleep = useSleepTimer(sleepPlayer);
  const player = useAudio(
    lib.tracks,
    settings,
    lib.setMessage,
    sleep.afterSong,
    sleep.finish,
    lib.markUnavailable,
  );
  sleepPlayer.current = player;
  useArtworkTheme(player.current, settings.theme);
  const discordStatus = useDiscord(player, settings);
  useEffect(() => {
    if (isTauri())
      void invoke("set_player_frame", { frameless: expanded || mini }).catch(
        (e) => lib.setMessage(String(e)),
      );
  }, [expanded, mini]);
  useMediaKeys(player, settings.mediaKeys);
  useEffect(() => {
    const block = (e: KeyboardEvent) => {
      if (
        e.key === "F12" ||
        e.key === "F5" ||
        ((e.ctrlKey || e.metaKey) &&
          (["KeyR", "KeyP", "KeyS", "KeyU"].includes(e.code) ||
            (e.shiftKey && ["KeyI", "KeyJ", "KeyC"].includes(e.code))))
      ) {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", block, true);
    return () => window.removeEventListener("keydown", block, true);
  }, []);
  useEffect(() => {
    if (expanded && !player.current) {
      setExpanded(false);
      if (fullscreen && isTauri()) {
        void invoke("toggle_fullscreen");
        setFullscreen(false);
      }
    }
  }, [expanded, player.current, fullscreen]);
  const actions = useRef({
    toggle: player.toggle,
    next: () => player.step(1),
    previous: () => player.step(-1),
    stop: () => {},
  });
  actions.current = {
    toggle: player.toggle,
    next: () => player.step(1),
    previous: () => player.step(-1),
    stop: () => {
      if (player.playing) player.toggle();
      player.seek(0);
    },
  };
  useEffect(() => {
    if (!isTauri()) return;
    void invoke("set_media_keys", { enabled: settings.mediaKeys }).catch((e) =>
      lib.setMessage(String(e)),
    );
  }, [settings.mediaKeys]);
  const selectedPlaylist = playlists.find((p) => p.id === view);
  const updateSettings = (change: Partial<Settings>) =>
    setSettings((prev) => ({ ...prev, ...change }));
  useEffect(() => persist("settingsV1", settings), [settings]);
  useEffect(() => persist("favorites", favorites), [favorites]);
  useEffect(() => persist("playlistsV1", playlists), [playlists]);
  useEffect(() => {
    if (isTauri())
      void invoke("set_desktop_preferences", {
        preferences: {
          closeToTray: settings.closeToTray,
          minimizeToTray: settings.minimizeToTray,
        },
      }).catch((e) =>
        lib.setMessage("Could not update window settings: " + String(e)),
      );
  }, [settings.closeToTray, settings.minimizeToTray]);
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    listen<string>("tray-action", (event) => {
      if (event.payload === "toggle") actions.current.toggle();
      else if (event.payload === "next") actions.current.next();
      else if (event.payload === "previous") actions.current.previous();
      else if (event.payload === "stop") actions.current.stop();
    })
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
  useEffect(() => {
    if (
      !isTauri() ||
      !settings.autoRefresh ||
      !lib.activeSources.some((s) => s.enabled) ||
      lib.setupOpen
    )
      return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      if (!lib.scanning.current) {
        try {
          const next = await invoke<string>("library_revision", {
            sources: lib.activeSources,
          });
          if (!cancelled && next !== lib.revision.current)
            await lib.loadSources(lib.activeSources, true);
        } catch (e) {
          if (!cancelled)
            lib.setMessage(
              "Automatic refresh could not check the library: " + String(e),
            );
        }
      }
      if (!cancelled) timer = setTimeout(check, settings.refreshSeconds * 1000);
    }
    timer = setTimeout(check, settings.refreshSeconds * 1000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    settings.autoRefresh,
    settings.refreshSeconds,
    lib.activeSources,
    lib.setupOpen,
    lib.loadSources,
  ]);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.defaultPrevented || !(event.target instanceof Element)) return;
      if (event.target.closest("dialog[open]")) return;
      if (event.key === "Escape" && expanded) {
        setExpanded(false);
        if (fullscreen) {
          void invoke("toggle_fullscreen");
          setFullscreen(false);
        }
        return;
      }
      const target = event.target as HTMLElement;
      if (
        event.code === "Space" &&
        !target.closest("input,textarea,select,button,dialog,summary") &&
        !lib.setupOpen
      ) {
        event.preventDefault();
        actions.current.toggle();
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [expanded, fullscreen, lib.setupOpen]);
  useEffect(() => {
    const dialog = playlistDialog.current;
    if (!dialog) return;
    if (dialogState && !dialog.open) dialog.showModal();
    else if (!dialogState && dialog.open) dialog.close();
  }, [dialogState]);

  const mappers = useMemo(
    () =>
      [...new Set(lib.tracks.map((t) => t.creator).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [lib.tracks],
  );
  const allTracks = useMemo(
    () => [...lib.tracks, ...lib.unavailable],
    [lib.tracks, lib.unavailable],
  );
  const fallbackTrack = (id: string): Track => ({
    id,
    title: "Unavailable song",
    artist: "",
    creator: "",
    audioPath: id,
    sources: [],
    modes: [],
    missing: true,
  });
  const tracksById = useMemo(
    () => new Map(allTracks.map((t) => [t.id, t])),
    [allTracks],
  );
  const favoriteIds = useMemo(() => new Set(favorites), [favorites]);
  const collection = useMemo(
    () =>
      view === "unavailable"
        ? lib.unavailable
        : selectedPlaylist
          ? selectedPlaylist.trackIds
              .map((id) => tracksById.get(id) || fallbackTrack(id))
              .filter((t): t is Track => !!t)
          : (view === "favorites" ? allTracks : lib.tracks).filter(
              (t) => view !== "favorites" || favoriteIds.has(t.id),
            ),
    [
      lib.tracks,
      lib.unavailable,
      allTracks,
      selectedPlaylist,
      view,
      favoriteIds,
      tracksById,
    ],
  );
  const visible = useMemo(
    () =>
      collection.filter(
        (t) =>
          (sourceFilter === "all" || t.sources.includes(sourceFilter)) &&
          (modeFilter === "all" || t.modes.includes(Number(modeFilter))) &&
          (mapperFilter === "all" || t.creator === mapperFilter) &&
          (t.title + " " + t.artist + " " + t.creator)
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [collection, sourceFilter, modeFilter, mapperFilter, query],
  );
  const missing = selectedPlaylist
    ? selectedPlaylist.trackIds.filter(
        (id) => !tracksById.has(id) || tracksById.get(id)?.missing,
      ).length
    : 0;
  const title =
    selectedPlaylist?.name ||
    (view === "unavailable"
      ? "Unavailable songs"
      : view === "favorites"
        ? "Favorites"
        : "Your collection");
  function favorite(id: string) {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function showPlaylistDialog(
    kind: "create" | "rename" | "delete" | "add",
    playlistId?: string,
    trackId?: string,
  ) {
    setPlaylistName(playlists.find((p) => p.id === playlistId)?.name || "");
    setPlaylistError("");
    setDialogState({ kind, playlistId, trackId });
  }
  function savePlaylist() {
    if (!dialogState) return;
    if (dialogState.kind === "delete") {
      setPlaylists((prev) =>
        prev.filter((p) => p.id !== dialogState.playlistId),
      );
      if (view === dialogState.playlistId) setView("library");
      setDialogState(null);
      return;
    }
    const name = playlistName.trim();
    if (!name) {
      setPlaylistError("Give your playlist a name.");
      return;
    }
    if (dialogState.kind === "create") {
      const id = crypto.randomUUID();
      setPlaylists((prev) => [
        ...prev,
        {
          id,
          name,
          trackIds: dialogState.trackId ? [dialogState.trackId] : [],
        },
      ]);
      setView(id);
    } else
      setPlaylists((prev) =>
        prev.map((p) => (p.id === dialogState.playlistId ? { ...p, name } : p)),
      );
    setDialogState(null);
  }
  function addToPlaylist(id: string, trackId: string) {
    setPlaylists((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, trackIds: [...new Set([...p.trackIds, trackId])] }
          : p,
      ),
    );
    setDialogState(null);
  }
  function removeTrack(id: string) {
    setPlaylists((prev) =>
      prev.map((p) =>
        p.id === view
          ? { ...p, trackIds: p.trackIds.filter((t) => t !== id) }
          : p,
      ),
    );
  }
  function moveTrack(id: string, direction: number) {
    setPlaylists((prev) =>
      prev.map((p) => {
        if (p.id !== view) return p;
        const ids = [...p.trackIds];
        const index = ids.indexOf(id);
        const next = index + direction;
        if (next < 0 || next >= ids.length) return p;
        [ids[index], ids[next]] = [ids[next], ids[index]];
        return { ...p, trackIds: ids };
      }),
    );
  }
  function playTrack(track: Track) {
    if (track.missing) {
      setDetailsId(track.id);
      return;
    }
    void player.play(
      track,
      visible.map((t) => t.id),
    );
  }
  async function minimize() {
    if (isTauri())
      try {
        await invoke("minimize_player");
      } catch (e) {
        lib.setMessage(String(e));
      }
  }
  async function fullScreen() {
    if (isTauri())
      try {
        setFullscreen(await invoke<boolean>("toggle_fullscreen"));
      } catch (e) {
        lib.setMessage(String(e));
      }
  }
  async function openBeatmap(track: Track) {
    if (track.beatmapSetId && isTauri())
      try {
        await invoke("open_beatmap", { id: track.beatmapSetId });
      } catch (e) {
        lib.setMessage(String(e));
      }
  }
  async function collapse() {
    setExpanded(false);
    if (fullscreen) {
      await fullScreen();
    }
  }

  async function setMiniMode(enabled: boolean) {
    try {
      if (isTauri())
        await invoke("set_mini_player", {
          enabled,
          pinned: settings.miniOnTop,
        });
      setExpanded(false);
      setFullscreen(false);
      setMini(enabled);
    } catch (e) {
      lib.setMessage("Could not change player window: " + String(e));
    }
  }
  useEffect(() => {
    if (mini && isTauri())
      void invoke("set_mini_player", {
        enabled: true,
        pinned: settings.miniOnTop,
      }).catch((e) => lib.setMessage(String(e)));
  }, [settings.miniOnTop]);
  async function backup(importing: boolean) {
    try {
      if (importing) {
        const imported = await importPlaylists(lib.tracks);
        if (imported) {
          setPlaylists((prev) => [...prev, ...imported]);
          lib.setMessage(
            `Imported ${imported.length} playlists. Existing playlists were kept.`,
          );
        }
      } else if (await exportPlaylists(playlists, lib.tracks))
        lib.setMessage("Playlist backup saved.");
    } catch (e) {
      lib.setMessage("Playlist backup: " + String(e));
    }
  }
  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className={
        "shell " +
        (layout === "grid" ? "artwork-layout " : "") +
        (sidebarCollapsed ? "sidebar-collapsed " : "") +
        (mini ? "mini-mode " : expanded ? "expanded-mode " : "") +
        (settings.compact ? "compact " : "") +
        (settings.reducedMotion ? "reduced-motion" : "")
      }
    >
      <aside>
        <div className="brand">
          <Logo />
          <span>
            Osu! Player<span className="beta">LOCAL MUSIC</span>
          </span>
        </div>
        <div className="nav-label">YOUR SPACE</div>
        <button
          className={"nav " + (view === "library" ? "selected" : "")}
          title="Your library"
          onClick={() => setView("library")}
        >
          <Library size={18} />
          Your library<span>{lib.tracks.length}</span>
        </button>
        <button
          className={"nav " + (view === "favorites" ? "selected" : "")}
          title="Favorites"
          onClick={() => setView("favorites")}
        >
          <Heart size={18} />
          Favorites
          <span>
            {lib.tracks.filter((t) => favorites.includes(t.id)).length}
          </span>
        </button>
        {lib.unavailable.length > 0 && (
          <button
            className={"nav " + (view === "unavailable" ? "selected" : "")}
            title="Unavailable songs"
            onClick={() => setView("unavailable")}
          >
            <FileWarning size={18} />
            Unavailable<span>{lib.unavailable.length}</span>
          </button>
        )}
        <div className="playlist-heading">
          <span className="nav-label">PLAYLISTS</span>
          <button
            className="icon"
            aria-label="Create playlist"
            onClick={() => showPlaylistDialog("create")}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="playlist-nav">
          {playlists.map((p) => (
            <button
              key={p.id}
              title={p.name}
              aria-label={p.name}
              className={"nav " + (view === p.id ? "selected" : "")}
              onClick={() => setView(p.id)}
            >
              <ListMusic size={17} />
              <strong>{p.name}</strong>
              <span>{p.trackIds.length}</span>
            </button>
          ))}
          {!playlists.length && (
            <p className="playlist-hint">
              No playlists yet.
              <button onClick={() => showPlaylistDialog("create")}>
                Create a playlist
              </button>
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <button
            className={"nav " + (view === "settings" ? "selected" : "")}
            onClick={() => setView("settings")}
          >
            <SettingsIcon size={18} />
            Settings
          </button>
          <button
            className="folder-button"
            disabled={lib.busy}
            onClick={lib.openSources}
          >
            <FolderPlus size={15} />
            {lib.busy ? "Scanning…" : "Music sources"}
          </button>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            YOUR MUSIC <span>/</span>{" "}
            {view === "settings"
              ? "SETTINGS"
              : selectedPlaylist
                ? "PLAYLIST"
                : view.toUpperCase()}
          </div>
          <div className="header-actions">
            <button
              className="icon"
              aria-label={
                sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
              }
              title="Toggle sidebar"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              <PanelLeft size={18} />
            </button>
            <button
              className="icon"
              aria-label="Open queue"
              title="Queue"
              onClick={() => setQueueOpen(!queueOpen)}
            >
              <ListMusic size={18} />
            </button>
            <button
              className="icon"
              aria-label="Open mini-player"
              title="Mini-player"
              onClick={() => void setMiniMode(true)}
            >
              <Music2 size={18} />
            </button>
            {view !== "settings" && (
              <label className="search">
                <Search size={17} />
                <input
                  aria-label="Search library"
                  placeholder="Search songs, artists, mappers"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            )}
            <button
              className="icon"
              aria-label="Open Now Playing"
              title="Now Playing"
              disabled={!player.current}
              onClick={() => setExpanded(true)}
            >
              <Maximize2 size={18} />
            </button>
            <button
              className="icon"
              aria-label="Minimize player"
              title="Minimize"
              onClick={minimize}
            >
              <Minus size={19} />
            </button>
          </div>
        </header>
        {lib.message && (
          <div className="notice" role="status">
            {lib.message}
            <button
              className="icon"
              aria-label="Dismiss message"
              onClick={() => lib.setMessage("")}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {view === "settings" ? (
          <SettingsView
            exportBackup={() => void backup(false)}
            importBackup={() => void backup(true)}
            discordStatus={discordStatus}
            settings={settings}
            update={updateSettings}
            busy={lib.busy}
            lastRefresh={lib.lastRefresh}
            rescan={() => lib.loadSources(lib.activeSources)}
            sources={lib.openSources}
          />
        ) : (
          <>
            <section
              className={"hero " + (selectedPlaylist ? "playlist-hero" : "")}
            >
              <div className="hero-copy">
                <div className="eyebrow">
                  {selectedPlaylist ? "PLAYLIST" : "LIBRARY"}
                </div>
                <h1>
                  {selectedPlaylist?.name ||
                    (view === "unavailable"
                      ? "Unavailable songs"
                      : view === "favorites"
                        ? "Favorites"
                        : "Library")}
                </h1>
                <p>
                  {selectedPlaylist
                    ? selectedPlaylist.trackIds.length + " songs"
                    : view === "unavailable"
                      ? "Locate moved audio files or update Music sources."
                      : view === "favorites"
                        ? "Your saved songs."
                        : lib.tracks.length +
                          " songs from your selected osu! libraries."}
                </p>
                <div className="hero-buttons">
                  <button
                    className="primary"
                    disabled={lib.busy}
                    onClick={() =>
                      visible[0] ? playTrack(visible[0]) : lib.openSources()
                    }
                  >
                    <Play size={16} fill="currentColor" />
                    {visible.length
                      ? "Play " + (selectedPlaylist ? "playlist" : "your music")
                      : "Find my osu! songs"}
                  </button>
                  {selectedPlaylist && (
                    <>
                      <button
                        className="icon"
                        aria-label="Rename playlist"
                        onClick={() =>
                          showPlaylistDialog("rename", selectedPlaylist.id)
                        }
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon"
                        aria-label="Delete playlist"
                        onClick={() =>
                          showPlaylistDialog("delete", selectedPlaylist.id)
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </section>
            <section className="library">
              <div
                className="view-switch"
                role="group"
                aria-label="Library layout"
              >
                <button
                  className={"icon " + (layout === "list" ? "pink" : "")}
                  aria-label="List view"
                  aria-pressed={layout === "list"}
                  onClick={() => setLayout("list")}
                >
                  <List size={18} />
                </button>
                <button
                  className={"icon " + (layout === "grid" ? "pink" : "")}
                  aria-label="Artwork grid view"
                  aria-pressed={layout === "grid"}
                  onClick={() => setLayout("grid")}
                >
                  <LayoutGrid size={18} />
                </button>
              </div>
              <div className="section-title">
                <div>
                  <h2>
                    {title}
                    <span>{visible.length} songs</span>
                  </h2>
                  <p>
                    {missing
                      ? missing +
                        " playlist songs are unavailable in the selected libraries."
                      : "Downloaded songs"}
                  </p>
                </div>
                <button
                  className="icon"
                  disabled={lib.busy || !lib.activeSources.length}
                  aria-label="Refresh library"
                  onClick={() => lib.loadSources(lib.activeSources)}
                >
                  <RefreshCw size={16} className={lib.busy ? "spin" : ""} />
                </button>
              </div>
              <div className="filters">
                <SlidersHorizontal size={14} />
                <select
                  aria-label="Filter by source"
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                >
                  <option value="all">All sources</option>
                  <option value="stable">osu! stable</option>
                  <option value="lazer">osu!lazer</option>
                </select>
                <select
                  aria-label="Filter by game mode"
                  value={modeFilter}
                  onChange={(e) => setModeFilter(e.target.value)}
                >
                  <option value="all">All game modes</option>
                  {modes.map((name, i) => (
                    <option value={i} key={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filter by mapper"
                  value={mapperFilter}
                  onChange={(e) => setMapperFilter(e.target.value)}
                >
                  <option value="all">All mappers</option>
                  {mappers.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
                {(sourceFilter !== "all" ||
                  modeFilter !== "all" ||
                  mapperFilter !== "all" ||
                  query) && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setSourceFilter("all");
                      setModeFilter("all");
                      setMapperFilter("all");
                      setQuery("");
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
              {visible.length ? (
                layout === "grid" ? (
                  <ArtworkGrid
                    tracks={visible}
                    current={player.current?.id}
                    play={playTrack}
                    favorite={favorite}
                    favorites={favoriteIds}
                    playlist={(id) => showPlaylistDialog("add", undefined, id)}
                    enqueue={player.enqueue}
                    details={(track) => setDetailsId(track.id)}
                  />
                ) : (
                  <div className="track-list">
                    <div className="table-head">
                      <span>#</span>
                      <span>SONG / ARTIST</span>
                      <span>MAPPED BY</span>
                      <span />
                    </div>
                    <VirtualRows
                      items={visible}
                      height={settings.compact ? 62 : 87}
                      render={(track, index) => (
                        <div
                          key={track.id}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setDetailsId(track.id);
                          }}
                          className={
                            "track " +
                            (track.missing ? "unavailable-track " : "") +
                            (player.current?.id === track.id ? "active" : "")
                          }
                        >
                          <button
                            className="track-play"
                            aria-label={"Play " + track.title}
                            onClick={() => playTrack(track)}
                          >
                            {player.current?.id === track.id &&
                            player.playing ? (
                              <Music2 size={16} />
                            ) : (
                              index + 1
                            )}
                          </button>
                          <button
                            className="song"
                            onClick={() => playTrack(track)}
                          >
                            <Cover track={track} />
                            <div>
                              <strong>{track.title}</strong>
                              <small>
                                {track.artist}
                                {track.missing && (
                                  <em className="unavailable-label">
                                    {" "}
                                    · Unavailable
                                  </em>
                                )}
                              </small>
                              <span className="source-badges">
                                {track.sources.map((source) => (
                                  <em key={source}>
                                    {source === "lazer"
                                      ? "osu!lazer"
                                      : "osu! stable"}
                                  </em>
                                ))}
                                {track.modes.map((mode) => (
                                  <em key={mode}>{modes[mode]}</em>
                                ))}
                              </span>
                            </div>
                          </button>
                          <div className="mapper">
                            <span>{track.creator || "Unknown mapper"}</span>
                            {track.beatmapSetId && (
                              <button
                                className="icon"
                                aria-label={
                                  "Open beatmap page for " + track.title
                                }
                                onClick={() => openBeatmap(track)}
                              >
                                <ExternalLink size={12} />
                              </button>
                            )}
                          </div>
                          <div className="track-actions">
                            <button
                              className="icon"
                              aria-label={"Song details for " + track.title}
                              title="Song details"
                              onClick={() => setDetailsId(track.id)}
                            >
                              <Info size={16} />
                            </button>
                            <details className="song-queue-menu">
                              <summary
                                aria-label={"Queue options for " + track.title}
                                title="Queue options"
                              >
                                <ListMusic size={16} />
                              </summary>
                              <div>
                                <button
                                  onClick={(e) => {
                                    player.enqueue(track.id, true);
                                    e.currentTarget
                                      .closest("details")
                                      ?.removeAttribute("open");
                                  }}
                                >
                                  Play next
                                </button>
                                <button
                                  onClick={(e) => {
                                    player.enqueue(track.id);
                                    e.currentTarget
                                      .closest("details")
                                      ?.removeAttribute("open");
                                  }}
                                >
                                  Add to queue
                                </button>
                              </div>
                            </details>
                            <button
                              className={
                                "icon " +
                                (favorites.includes(track.id) ? "pink" : "")
                              }
                              aria-label={
                                favorites.includes(track.id)
                                  ? "Remove favorite " + track.title
                                  : "Favorite " + track.title
                              }
                              onClick={() => favorite(track.id)}
                            >
                              <Heart
                                size={16}
                                fill={
                                  favorites.includes(track.id)
                                    ? "currentColor"
                                    : "none"
                                }
                              />
                            </button>
                            <button
                              className="icon"
                              aria-label={"Add " + track.title + " to playlist"}
                              onClick={() =>
                                showPlaylistDialog("add", undefined, track.id)
                              }
                            >
                              <Plus size={17} />
                            </button>
                            {selectedPlaylist && (
                              <>
                                <button
                                  className="icon"
                                  aria-label={"Move " + track.title + " up"}
                                  disabled={
                                    selectedPlaylist.trackIds.indexOf(
                                      track.id,
                                    ) === 0
                                  }
                                  onClick={() => moveTrack(track.id, -1)}
                                >
                                  <ArrowUp size={14} />
                                </button>
                                <button
                                  className="icon"
                                  aria-label={"Move " + track.title + " down"}
                                  disabled={
                                    selectedPlaylist.trackIds.indexOf(
                                      track.id,
                                    ) ===
                                    selectedPlaylist.trackIds.length - 1
                                  }
                                  onClick={() => moveTrack(track.id, 1)}
                                >
                                  <ArrowDown size={14} />
                                </button>
                                <button
                                  className="icon"
                                  aria-label={
                                    "Remove " + track.title + " from playlist"
                                  }
                                  onClick={() => removeTrack(track.id)}
                                >
                                  <X size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    />
                  </div>
                )
              ) : (
                <div className="empty">
                  <div className="empty-icon">
                    {selectedPlaylist ? (
                      <ListMusic size={32} />
                    ) : view === "favorites" ? (
                      <Heart size={30} />
                    ) : (
                      <Disc3 size={34} />
                    )}
                  </div>
                  <h3>
                    {query ||
                    sourceFilter !== "all" ||
                    modeFilter !== "all" ||
                    mapperFilter !== "all"
                      ? "No songs match these filters"
                      : selectedPlaylist
                        ? "This playlist is empty."
                        : view === "unavailable"
                          ? "Locate moved audio files or update Music sources."
                          : view === "favorites"
                            ? "No favorites yet"
                            : "No songs loaded."}
                  </h3>
                  <p>
                    {selectedPlaylist
                      ? "Use the + next to a song in your library to add it here."
                      : "Choose your libraries, or try a different search."}
                  </p>
                  {!lib.tracks.length && (
                    <button
                      className="folder-button"
                      disabled={lib.busy}
                      onClick={lib.openSources}
                    >
                      <FolderPlus size={16} />
                      Music sources
                    </button>
                  )}
                  {selectedPlaylist && (
                    <button
                      className="folder-button"
                      title="Your library"
                      onClick={() => setView("library")}
                    >
                      Browse your library
                    </button>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {!expanded && !mini && (
        <PlayerBar
          player={player}
          settings={settings}
          favorites={favorites}
          favorite={favorite}
          updateSettings={updateSettings}
          onSettings={() => setView("settings")}
          onExpand={() => setExpanded(true)}
        />
      )}
      {expanded && (
        <NowPlaying
          player={player}
          settings={settings}
          favorites={favorites}
          favorite={favorite}
          updateSettings={updateSettings}
          onSettings={() => {
            void collapse();
            setView("settings");
          }}
          onCollapse={() => void collapse()}
          onFullscreen={() => void fullScreen()}
          onMinimize={() => void minimize()}
          onAddToPlaylist={(id) => showPlaylistDialog("add", undefined, id)}
          onOpenBeatmap={(track) => void openBeatmap(track)}
          fullscreen={fullscreen}
          message={lib.message}
        />
      )}
      {queueOpen && !mini && (
        <QueueView
          player={player}
          tracks={lib.tracks}
          close={() => setQueueOpen(false)}
        />
      )}
      {mini && (
        <MiniPlayer
          player={player}
          pinned={settings.miniOnTop}
          pin={() => updateSettings({ miniOnTop: !settings.miniOnTop })}
          expand={() => void setMiniMode(false)}
        />
      )}
      <audio ref={player.primary} crossOrigin="anonymous" preload="metadata" />
      <audio ref={player.spare} crossOrigin="anonymous" preload="auto" />
      <div
        className={
          "utility-dock " + (mini ? "in-mini" : expanded ? "in-expanded" : "")
        }
      >
        <QuickSearch
          tracks={lib.tracks}
          play={(track, ids) => void player.play(track, ids)}
        />
        <SleepTimerControl timer={sleep} />
      </div>
      <SongDetails
        track={
          detailsId
            ? tracksById.get(detailsId) || fallbackTrack(detailsId)
            : null
        }
        close={() => setDetailsId(null)}
        relink={(id, path) =>
          lib.relink(id, path, tracksById.get(id) || fallbackTrack(id))
        }
        refresh={() => void lib.loadSources(lib.activeSources)}
      />
      <SourcesDialog lib={lib} />
      <dialog
        ref={playlistDialog}
        className="source-dialog playlist-dialog"
        aria-labelledby="playlist-dialog-title"
        onCancel={() => setDialogState(null)}
      >
        <button
          className="icon dialog-close"
          aria-label="Close playlist dialog"
          onClick={() => setDialogState(null)}
        >
          <X size={19} />
        </button>
        <div className="eyebrow">PLAYLISTS</div>
        <h2 id="playlist-dialog-title">
          {dialogState?.kind === "add"
            ? "Add to a playlist"
            : dialogState?.kind === "delete"
              ? "Delete playlist?"
              : dialogState?.kind === "rename"
                ? "Rename playlist"
                : "Create a playlist"}
        </h2>
        {dialogState?.kind === "add" ? (
          <>
            <div className="playlist-picker">
              {playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  className="playlist-option"
                  disabled={playlist.trackIds.includes(dialogState.trackId!)}
                  onClick={() =>
                    addToPlaylist(playlist.id, dialogState.trackId!)
                  }
                >
                  <ListMusic size={22} />
                  <div>
                    <strong>{playlist.name}</strong>
                    <small>{playlist.trackIds.length} songs</small>
                  </div>
                  <span>
                    {playlist.trackIds.includes(dialogState.trackId!) ? (
                      "Added"
                    ) : (
                      <Plus size={17} />
                    )}
                  </span>
                </button>
              ))}
            </div>
            <button
              className="folder-button"
              onClick={() =>
                showPlaylistDialog("create", undefined, dialogState.trackId)
              }
            >
              <Plus size={16} />
              New playlist
            </button>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              savePlaylist();
            }}
          >
            {dialogState?.kind === "delete" ? (
              <p className="setup-intro">
                Remove “
                {playlists.find((p) => p.id === dialogState.playlistId)?.name}”
                from your playlists? Your songs and beatmap files will stay on
                your PC.
              </p>
            ) : (
              <label className="playlist-name-label">
                Playlist name
                <input
                  autoFocus
                  aria-label="Playlist name"
                  maxLength={80}
                  value={playlistName}
                  placeholder="Playlist name"
                  onChange={(e) => setPlaylistName(e.target.value)}
                />
              </label>
            )}
            {playlistError && (
              <p className="notice" role="alert">
                {playlistError}
              </p>
            )}
            <div className="setup-actions">
              <button
                className="text-button"
                type="button"
                onClick={() => setDialogState(null)}
              >
                Cancel
              </button>
              <button className="primary" type="submit">
                {dialogState?.kind === "delete"
                  ? "Delete playlist"
                  : dialogState?.kind === "rename"
                    ? "Save name"
                    : "Create playlist"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
