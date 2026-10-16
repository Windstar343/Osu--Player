import {
  Maximize2,
  Pin,
  Minus,
  X,
  Music2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  MoreHorizontal,
  Shuffle,
  Repeat,
} from "lucide-react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { Player } from "./useAudio";
import { time } from "./model";
export function MiniPlayer({
  player,
  pinned,
  pin,
  expand,
}: {
  player: Player;
  pinned: boolean;
  pin: () => void;
  expand: () => void;
}) {
  const track = player.current;
  return (
    <section className="mini-player" aria-label="Mini-player">
      {track?.backgroundPath ? (
        <img
          className="mini-art"
          src={convertFileSrc(track.backgroundPath)}
          alt=""
          data-tauri-drag-region
        />
      ) : (
        <div className="mini-art mini-placeholder" data-tauri-drag-region>
          <Music2 size={70} />
        </div>
      )}
      <div className="mini-shade" data-tauri-drag-region />
      <div className="mini-tools" data-tauri-drag-region>
        <button
          className="icon"
          aria-label="Return to full player"
          title="Full player"
          onClick={expand}
        >
          <Maximize2 size={14} />
        </button>
        <span data-tauri-drag-region />
        <button
          className={"icon " + (pinned ? "pinned" : "")}
          aria-label="Keep mini-player on top"
          title="Keep on top"
          aria-pressed={pinned}
          onClick={pin}
        >
          <Pin size={13} />
        </button>
        <button
          className="icon"
          aria-label="Minimize player"
          onClick={() => void invoke("minimize_player")}
        >
          <Minus size={15} />
        </button>
        <button
          className="icon"
          aria-label="Close mini-player"
          onClick={() => void invoke("close_player")}
        >
          <X size={15} />
        </button>
      </div>
      <div className="mini-bottom">
        <div className="mini-song" data-tauri-drag-region>
          <h1 title={track?.title} data-tauri-drag-region>
            {track?.title || "Nothing playing"}
          </h1>
          <p title={track?.artist} data-tauri-drag-region>
            {track?.artist || "Choose a song in your library"}
          </p>
        </div>
        <div className="mini-timeline">
          <span>{time(player.position / player.rate)}</span>
          <input
            aria-label="Playback position"
            type="range"
            min={0}
            max={player.duration || 1}
            step={0.1}
            value={Math.min(player.position, player.duration || 1)}
            disabled={!player.duration}
            onChange={(e) => player.seek(Number(e.target.value))}
          />
          <span>
            −
            {time(Math.max(0, player.duration - player.position) / player.rate)}
          </span>
        </div>
        <div className="mini-controls">
          <details className="mini-popover">
            <summary aria-label="Volume controls" title="Volume">
              <Volume2 size={18} />
            </summary>
            <div>
              <input
                aria-label="Volume"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={player.volume}
                onChange={(e) => player.setVolume(Number(e.target.value))}
              />
            </div>
          </details>
          <div className="mini-transport">
            <button
              className="icon"
              aria-label="Previous song"
              disabled={!track}
              onClick={() => player.step(-1)}
            >
              <SkipBack size={22} fill="currentColor" />
            </button>
            <button
              className="icon mini-play"
              aria-label={player.playing ? "Pause" : "Play"}
              onClick={player.toggle}
            >
              {player.playing ? (
                <Pause size={24} fill="currentColor" />
              ) : (
                <Play size={24} fill="currentColor" />
              )}
            </button>
            <button
              className="icon"
              aria-label="Next song"
              disabled={!track}
              onClick={() => player.step(1)}
            >
              <SkipForward size={22} fill="currentColor" />
            </button>
          </div>
          <details className="mini-popover mini-options">
            <summary aria-label="Playback options" title="Playback options">
              <MoreHorizontal size={20} />
            </summary>
            <div>
              <button
                className={player.shuffle ? "selected" : ""}
                aria-label="Shuffle"
                aria-pressed={player.shuffle}
                onClick={() => player.setShuffle(!player.shuffle)}
              >
                <Shuffle size={15} />
                Shuffle
              </button>
              <button
                className={player.repeat ? "selected" : ""}
                aria-label="Repeat song"
                aria-pressed={player.repeat}
                onClick={() => player.setRepeat(!player.repeat)}
              >
                <Repeat size={15} />
                Repeat song
              </button>
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}
