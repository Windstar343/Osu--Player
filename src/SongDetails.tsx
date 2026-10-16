import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { X, FolderOpen, FileSearch } from "lucide-react";
import { Track, modes } from "./model";
import { Cover } from "./PlayerViews";
type FileInfo = { exists: boolean; bytes: number; format: string };
export function SongDetails({
  track,
  close,
  relink,
  sources,
  refresh,
}: {
  track: Track | null;
  close: () => void;
  relink: (id: string, path: string) => void;
  sources: () => void;
  refresh: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [info, setInfo] = useState<FileInfo | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const d = dialog.current!;
    setError("");
    setInfo(null);
    if (!track) {
      if (d.open) d.close();
      return;
    }
    if (!d.open) d.showModal();
    let cancelled = false;
    invoke<FileInfo>("audio_file_info", { path: track.audioPath })
      .then((value) => {
        if (!cancelled) setInfo(value);
      })
      .catch(() => {
        if (!cancelled) setInfo({ exists: false, bytes: 0, format: "" });
      });
    return () => {
      cancelled = true;
    };
  }, [track]);
  async function locate() {
    if (!track) return;
    try {
      const picked = await open({
        multiple: false,
        title: "Locate audio for " + track.title,
        filters: [
          {
            name: "Audio files",
            extensions: [
              "mp3",
              "ogg",
              "wav",
              "flac",
              "m4a",
              "aac",
              "opus",
              "oga",
            ],
          },
        ],
      });
      if (typeof picked !== "string") return;
      const path = await invoke<string>("authorize_audio_file", {
        path: picked,
      });
      relink(track.id, path);
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <dialog
      className="song-details source-dialog"
      ref={dialog}
      aria-label="Song details"
      onCancel={close}
      onClose={close}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        className="icon dialog-close"
        aria-label="Close song details"
        onClick={close}
      >
        <X size={18} />
      </button>
      {track && (
        <>
          <div className="details-heading">
            <Cover track={track} />
            <div>
              <h2>{track.title}</h2>
              <p>{track.artist}</p>
            </div>
          </div>
          <dl>
            <dt>Mapper</dt>
            <dd>{track.creator || "Unknown"}</dd>
            <dt>Library</dt>
            <dd>
              {track.sources
                .map((s) => (s === "lazer" ? "osu!lazer" : "osu! stable"))
                .join(", ")}
            </dd>
            <dt>Game modes</dt>
            <dd>{track.modes.map((m) => modes[m]).join(", ")}</dd>
            <dt>Audio file</dt>
            <dd className="file-path">{track.audioPath}</dd>
            <dt>Availability</dt>
            <dd>
              {!info
                ? "Checking file…"
                : info.exists
                  ? "Available on this PC"
                  : "Unavailable — the file or library may have moved."}
            </dd>
            {info?.exists && (
              <>
                <dt>Format / size</dt>
                <dd>
                  {info.format.toUpperCase()} ·{" "}
                  {(info.bytes / 1048576).toFixed(1)} MB
                </dd>
              </>
            )}
          </dl>
          {(!info?.exists || track.missing) && (
            <p className="mode-explanation">
              Check Music sources if you moved osu! or switched libraries. You
              can also locate this song’s audio file. Favorites and playlists
              keep their references.
            </p>
          )}
          <div className="settings-actions">
            <button
              className="folder-button"
              disabled={!info?.exists}
              onClick={() =>
                void invoke("show_audio_file", { path: track.audioPath }).catch(
                  (e) => setError(String(e)),
                )
              }
            >
              <FolderOpen size={15} />
              Show in folder
            </button>
            <button className="folder-button" onClick={() => void locate()}>
              <FileSearch size={15} />
              Locate audio file
            </button>
            <button
              className="text-button"
              onClick={() => {
                close();
                sources();
              }}
            >
              Music sources
            </button>
            <button
              className="text-button"
              onClick={() => {
                close();
                refresh();
              }}
            >
              Refresh library
            </button>
          </div>
          {error && (
            <p role="alert" className="notice">
              {error}
            </p>
          )}
        </>
      )}
    </dialog>
  );
}
