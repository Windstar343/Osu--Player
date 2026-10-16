import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Play, X } from "lucide-react";
import { Track } from "./model";
import { Player } from "./useAudio";
import { VirtualRows } from "./VirtualRows";
import { Cover } from "./PlayerViews";
export function QueueView({
  player,
  tracks,
  close,
}: {
  player: Player;
  tracks: Track[];
  close: () => void;
}) {
  const byId = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);
  const [drag, setDrag] = useState<number | null>(null);
  return (
    <section className="queue-panel" aria-label="Playback queue">
      <div className="queue-heading">
        <div>
          <h2>Queue</h2>
          <p>{player.queue.length} songs · drag to reorder</p>
        </div>
        <button className="text-button" onClick={player.clearQueue}>
          Clear queue
        </button>
        <button className="icon" aria-label="Close queue" onClick={close}>
          <X size={19} />
        </button>
      </div>
      {!player.queue.length && (
        <p className="queue-empty">
          Use a song’s queue menu to add songs here.
        </p>
      )}
      <div className="queue-rows" role="list">
        <VirtualRows
          items={player.queue}
          height={72}
          render={(id, index) => {
            const track = byId.get(id);
            return (
              <div
                role="listitem"
                key={index}
                className={
                  "queue-row " + (index === player.queueIndex ? "current" : "")
                }
                draggable
                onDragStart={(e) => {
                  setDrag(index);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(index));
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (drag !== null) player.moveQueued(drag, index);
                  setDrag(null);
                }}
                onDragEnd={() => setDrag(null)}
              >
                <GripVertical size={15} />
                <Cover track={track || null} />
                <button
                  className="queue-song"
                  disabled={!track}
                  onClick={() => player.playQueued(index)}
                >
                  <strong>{track?.title || "Unavailable song"}</strong>
                  <small>
                    {index === player.queueIndex ? "Now playing · " : ""}
                    {track?.artist}
                  </small>
                </button>
                <button
                  className="icon"
                  aria-label={"Play queued song " + (index + 1)}
                  disabled={!track}
                  onClick={() => player.playQueued(index)}
                >
                  <Play size={14} />
                </button>
                <button
                  className="icon"
                  aria-label={"Move queued song " + (index + 1) + " up"}
                  disabled={index === 0}
                  onClick={() => player.moveQueued(index, index - 1)}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  className="icon"
                  aria-label={"Move queued song " + (index + 1) + " down"}
                  disabled={index === player.queue.length - 1}
                  onClick={() => player.moveQueued(index, index + 1)}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  className="icon"
                  aria-label={"Remove queued song " + (index + 1)}
                  disabled={index === player.queueIndex}
                  onClick={() => player.removeQueued(index)}
                >
                  <X size={14} />
                </button>
              </div>
            );
          }}
        />
      </div>
    </section>
  );
}
