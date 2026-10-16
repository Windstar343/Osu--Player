import {
  Music2,
  Heart,
  Play,
  Pause,
  Shuffle,
  Repeat,
  SkipBack,
  SkipForward,
  Volume2,
  ArrowLeft,
  Maximize2,
  Minimize2,
  Minus,
  Disc3,
  Plus,
  ExternalLink,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { Track, Settings, time, modes } from "./model";
import { Player } from "./useAudio";
import { PlaybackModes } from "./PlaybackModes";
const artwork = (track: Track | null) =>
  track?.backgroundPath ? convertFileSrc(track.backgroundPath) : undefined;
export function Cover({
  track,
  large = false,
}: {
  track: Track | null;
  large?: boolean;
}) {
  return (
    <div className={"cover " + (large ? "big" : "")}>
      {artwork(track) ? (
        <img src={artwork(track)} alt="" loading="lazy" />
      ) : (
        <Music2 size={large ? 26 : 20} />
      )}
    </div>
  );
}
export function Transport({ player }: { player: Player }) {
  return (
    <div className="transport">
      <div className="controls">
        <button
          className={"icon " + (player.shuffle ? "pink" : "")}
          aria-label="Shuffle"
          aria-pressed={player.shuffle}
          onClick={() => player.setShuffle(!player.shuffle)}
        >
          <Shuffle size={17} />
        </button>
        <button
          className="icon"
          aria-label="Previous song"
          disabled={!player.current}
          onClick={() => player.step(-1)}
        >
          <SkipBack size={20} />
        </button>
        <button
          className="play-button"
          aria-label={player.playing ? "Pause" : "Play"}
          onClick={player.toggle}
        >
          <>
            {player.playing ? (
              <Pause size={19} fill="currentColor" />
            ) : (
              <Play size={19} fill="currentColor" />
            )}
          </>
        </button>
        <button
          className="icon"
          aria-label="Next song"
          disabled={!player.current}
          onClick={() => player.step(1)}
        >
          <SkipForward size={20} />
        </button>
        <button
          className={"icon " + (player.repeat ? "pink" : "")}
          aria-label="Repeat song"
          aria-pressed={player.repeat}
          onClick={() => player.setRepeat(!player.repeat)}
        >
          <Repeat size={17} />
        </button>
      </div>
      <div className="timeline">
        <span>{time(player.position / player.rate)}</span>
        <input
          aria-label="Playback position"
          type="range"
          min="0"
          max={player.duration || 1}
          step=".1"
          value={Math.min(player.position, player.duration || 1)}
          disabled={!player.duration}
          onChange={(e) => player.seek(Number(e.target.value))}
        />
        <span>{time(player.duration / player.rate)}</span>
      </div>
    </div>
  );
}
export function Volume({ player }: { player: Player }) {
  return (
    <label className="volume">
      <Volume2 size={18} />
      <input
        aria-label="Volume"
        type="range"
        min="0"
        max="1"
        step=".01"
        value={player.volume}
        onChange={(e) => player.setVolume(Number(e.target.value))}
      />
    </label>
  );
}

type PlayerActions = {
  player: Player;
  settings: Settings;
  favorites: string[];
  favorite: (id: string) => void;
  updateSettings: (change: Partial<Settings>) => void;
  onSettings: () => void;
};
export function PlayerBar({
  player,
  settings,
  favorites,
  favorite,
  updateSettings,
  onSettings,
  onExpand,
}: PlayerActions & { onExpand: () => void }) {
  return (
    <footer>
      <div className="now-playing">
        <button
          className="artwork-button"
          aria-label="Expand Now Playing"
          disabled={!player.current}
          onClick={onExpand}
        >
          <Cover track={player.current} large />
        </button>
        <button
          className="now-playing-title"
          disabled={!player.current}
          onClick={onExpand}
        >
          <strong>{player.current?.title || "Nothing playing yet"}</strong>
          <small>{player.current?.artist || "Choose a song"}</small>
        </button>
        {player.current && (
          <button
            className={
              "icon " + (favorites.includes(player.current.id) ? "pink" : "")
            }
            aria-label="Favorite current song"
            onClick={() => favorite(player.current!.id)}
          >
            <Heart
              size={17}
              fill={
                favorites.includes(player.current.id) ? "currentColor" : "none"
              }
            />
          </button>
        )}
      </div>
      <Transport player={player} />
      <div className="footer-right">
        <PlaybackModes settings={settings} onChange={updateSettings} compact />
        <Volume player={player} />
        <button
          className="icon"
          aria-label="Audio settings"
          onClick={onSettings}
        >
          <SlidersHorizontal size={17} />
        </button>
      </div>
    </footer>
  );
}
export function NowPlaying({
  player,
  settings,
  favorites,
  favorite,
  updateSettings,
  onSettings,
  onCollapse,
  onFullscreen,
  onMinimize,
  onAddToPlaylist,
  onOpenBeatmap,
  fullscreen,
  message,
}: PlayerActions & {
  onCollapse: () => void;
  onFullscreen: () => void;
  onMinimize: () => void;
  onAddToPlaylist: (id: string) => void;
  onOpenBeatmap: (track: Track) => void;
  fullscreen: boolean;
  message: string;
}) {
  if (!player.current) return null;
  return (
    <section
      className={"expanded-player " + (player.playing ? "playing" : "")}
      aria-label="Now Playing"
    >
      {artwork(player.current) && (
        <img className="ambient-art" src={artwork(player.current)} alt="" />
      )}
      <div className="expanded-top" data-tauri-drag-region>
        <button className="folder-button" onClick={onCollapse}>
          <ArrowLeft size={16} />
          Back to library
        </button>
        <span data-tauri-drag-region>NOW PLAYING</span>
        <div>
          <button
            className="icon"
            aria-label={fullscreen ? "Leave full screen" : "Enter full screen"}
            onClick={onFullscreen}
          >
            {fullscreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
          </button>
          <button
            className="icon"
            aria-label="Minimize player"
            onClick={onMinimize}
          >
            <Minus size={20} />
          </button>
          <button
            className="icon"
            aria-label="Close player"
            onClick={() => void invoke("close_player")}
          >
            <X size={19} />
          </button>
        </div>
      </div>
      <div className="expanded-content">
        <div className="large-art">
          {artwork(player.current) ? (
            <img
              src={artwork(player.current)}
              alt={"Artwork for " + player.current.title}
            />
          ) : (
            <Disc3 size={150} />
          )}
        </div>
        <div className="expanded-details">
          <div className="eyebrow">NOW PLAYING</div>
          <div className="expanded-song-title">
            <h1>{player.current.title}</h1>
            <button
              className={
                "icon " + (favorites.includes(player.current.id) ? "pink" : "")
              }
              aria-label="Favorite current song"
              onClick={() => favorite(player.current!.id)}
            >
              <Heart
                size={24}
                fill={
                  favorites.includes(player.current.id)
                    ? "currentColor"
                    : "none"
                }
              />
            </button>
          </div>
          <p className="expanded-artist">{player.current.artist}</p>
          <p className="expanded-mapper">
            Mapped by {player.current.creator || "Unknown mapper"}
          </p>
          <span className="source-badges">
            {player.current.sources.map((source) => (
              <em key={source}>
                {source === "lazer" ? "osu!lazer" : "osu! stable"}
              </em>
            ))}
            {player.current.modes.map((mode) => (
              <em key={mode}>{modes[mode]}</em>
            ))}
          </span>
          <PlaybackModes settings={settings} onChange={updateSettings} />
          <Transport player={player} />
          <Volume player={player} />
          <div className="expanded-extras">
            <button
              className="folder-button"
              onClick={() => onAddToPlaylist(player.current!.id)}
            >
              <Plus size={15} />
              Add to playlist
            </button>
            {player.current.beatmapSetId && (
              <button
                className="text-button"
                onClick={() => onOpenBeatmap(player.current!)}
              >
                <ExternalLink size={14} />
                Beatmap page
              </button>
            )}
            <button
              className="icon"
              aria-label="Audio settings"
              onClick={onSettings}
            >
              <SlidersHorizontal size={17} />
            </button>
          </div>
        </div>
      </div>
      {message && (
        <div className="expanded-notice notice" role="status">
          {message}
        </div>
      )}
    </section>
  );
}
