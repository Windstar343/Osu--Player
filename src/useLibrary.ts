import { useState, useEffect, useRef, useCallback } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Track, Source, stored, persist } from "./model";
import { reconcileLibrary } from "./libraryCatalog";
export function useLibrary() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [unavailable, setUnavailable] = useState<Track[]>([]);
  const catalog = useRef<Track[]>(stored("knownTracksV1", []));
  const overrides = useRef<Record<string, string>>(
    stored("audioOverridesV1", {}),
  );
  const [sources, setSources] = useState<Source[]>(
    () =>
      stored<Source[] | null>("librarySourcesV1", null) || [
        { kind: "stable", folder: "", enabled: false },
        { kind: "lazer", folder: "", enabled: false },
      ],
  );
  const [activeSources, setActiveSources] = useState<Source[]>(() =>
    stored("librarySourcesV1", []),
  );
  const [setupOpen, setSetupOpen] = useState(
    () => !stored("librarySourcesV1", null),
  );
  const [setupError, setSetupError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const revision = useRef("");
  const scanning = useRef(false);
  const sourceDialog = useRef<HTMLDialogElement>(null);
  const loadSources = useCallback(
    async (selection: Source[], automatic = false) => {
      if (scanning.current) return false;
      scanning.current = true;
      setBusy(true);
      if (!automatic) {
        setMessage("");
        setSetupError("");
      }
      try {
        const before = await invoke<string>("library_revision", {
          sources: selection,
        });
        const result = await invoke<{
          tracks: Track[];
          skipped: number;
          warnings: string[];
        }>("scan_sources", { sources: selection });
        const fresh = result.tracks.map((t) => ({
          ...t,
          modes: t.modes?.length ? t.modes : [0],
        }));
        const byId = new Map(fresh.map((t) => [t.id, t]));
        for (const [id, path] of Object.entries(overrides.current)) {
          const original =
            byId.get(id) || catalog.current.find((t) => t.id === id);
          if (!original) continue;
          try {
            const resolved = await invoke<string>("authorize_audio_file", {
              path,
            });
            byId.set(id, { ...original, audioPath: resolved, missing: false });
          } catch {
            /* Keep missing overrides recoverable. */
          }
        }
        const available = [...byId.values()];
        const reconciled = reconcileLibrary(available, catalog.current);
        catalog.current = reconciled.catalog;
        persist("knownTracksV1", catalog.current);
        setTracks(available);
        setUnavailable(reconciled.unavailable);
        revision.current = before;
        setLastRefresh(Date.now());
        const notes = [...result.warnings];
        if (result.skipped)
          notes.push(
            result.skipped + " missing or unreadable beatmaps skipped.",
          );
        if (!result.tracks.length)
          notes.push("No downloaded songs found in these libraries.");
        setMessage(notes.join(" "));
        return true;
      } catch (e) {
        const error = "Could not load your music: " + String(e);
        setMessage(error);
        if (!automatic) setSetupError(error);
        return false;
      } finally {
        scanning.current = false;
        setBusy(false);
      }
    },
    [],
  );
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const detected = await invoke<Source[]>("discover_sources");
        if (cancelled) return;
        const saved = stored<Source[] | null>("librarySourcesV1", null);
        const next = (["stable", "lazer"] as const).map(
          (kind) =>
            saved?.find((s) => s.kind === kind) ||
            detected.find((s) => s.kind === kind) || {
              kind,
              folder: kind === "stable" ? stored<string>("folder", "") : "",
              enabled: false,
            },
        );
        setSources(next);
        if (saved) await loadSources(next);
      } catch (e) {
        if (!cancelled) {
          setSetupError(String(e));
          setSetupOpen(true);
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSources]);
  useEffect(() => {
    const dialog = sourceDialog.current;
    if (!dialog) return;
    if (setupOpen && !dialog.open) dialog.showModal();
    else if (!setupOpen && dialog.open) dialog.close();
  }, [setupOpen]);
  async function browseSource(kind: Source["kind"]) {
    if (!isTauri()) {
      setSetupError("Folder selection requires the desktop app.");
      return;
    }
    try {
      const folder = await open({
        directory: true,
        multiple: false,
        title:
          kind === "stable"
            ? "Choose osu! stable or its Songs folder"
            : "Choose osu!lazer data folder (client.realm and files)",
      });
      if (typeof folder === "string")
        setSources((prev) =>
          prev.map((s) =>
            s.kind === kind ? { ...s, folder, enabled: true } : s,
          ),
        );
    } catch (e) {
      setSetupError(String(e));
    }
  }
  async function saveSources() {
    if (!sources.some((s) => s.enabled)) {
      setSetupError("Select at least one library.");
      return;
    }
    if (sources.some((s) => s.enabled && !s.folder)) {
      setSetupError("Locate a folder for each selected library.");
      return;
    }
    if (await loadSources(sources)) {
      persist("librarySourcesV1", sources);
      setActiveSources(sources);
      setSetupOpen(false);
    }
  }
  function cancelSetup() {
    const saved = stored<Source[] | null>("librarySourcesV1", null);
    if (saved) setSources(saved);
    setSetupOpen(false);
  }
  return {
    tracks,
    unavailable,
    markUnavailable: async (track: Track) => {
      try {
        const info = await invoke<{ exists: boolean }>("audio_file_info", {
          path: track.audioPath,
        });
        if (info.exists) return;
      } catch {
        /* The selected file is no longer accessible. */
      }
      setTracks((prev) => prev.filter((t) => t.id !== track.id));
      setUnavailable((prev) => [
        ...prev.filter((t) => t.id !== track.id),
        { ...track, missing: true },
      ]);
    },
    relink: (id: string, path: string, fallback?: Track) => {
      const original = catalog.current.find((t) => t.id === id) || fallback;
      if (!original) return;
      const replacement = { ...original, audioPath: path, missing: false };
      overrides.current = { ...overrides.current, [id]: path };
      persist("audioOverridesV1", overrides.current);
      catalog.current = [
        ...catalog.current.filter((t) => t.id !== id),
        replacement,
      ];
      persist("knownTracksV1", catalog.current);
      setTracks((prev) => [...prev.filter((t) => t.id !== id), replacement]);
      setUnavailable((prev) => prev.filter((t) => t.id !== id));
    },
    sources,
    setSources,
    activeSources,
    setupOpen,
    setSetupOpen,
    setupError,
    setSetupError,
    message,
    setMessage,
    busy,
    lastRefresh,
    revision,
    scanning,
    sourceDialog,
    loadSources,
    browseSource,
    saveSources,
    cancelSetup,
    openSources: () => {
      setSetupError("");
      setSetupOpen(true);
    },
  };
}
