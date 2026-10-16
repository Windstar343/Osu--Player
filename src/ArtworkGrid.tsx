import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Heart, ListMusic, Plus, Info } from "lucide-react";
import { Track } from "./model";
import { Cover } from "./PlayerViews";
import { VirtualRows } from "./VirtualRows";
export function ArtworkGrid({
  tracks,
  current,
  play,
  favorite,
  favorites,
  playlist,
  enqueue,
  details,
}: {
  details: (track: Track) => void;
  tracks: Track[];
  current?: string;
  play: (t: Track) => void;
  favorite: (id: string) => void;
  favorites: Set<string>;
  playlist: (id: string) => void;
  enqueue: (id: string, next?: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(4);
  useEffect(() => {
    const observer = new ResizeObserver(() =>
      setColumns(
        Math.max(2, Math.floor((root.current?.clientWidth || 800) / 185)),
      ),
    );
    observer.observe(root.current!);
    return () => observer.disconnect();
  }, []);
  const rows = useMemo(
    () =>
      Array.from({ length: Math.ceil(tracks.length / columns) }, (_, i) =>
        tracks.slice(i * columns, (i + 1) * columns),
      ),
    [tracks, columns],
  );
  const actions = useRef({ play, favorite, playlist, enqueue, details });
  actions.current = { play, favorite, playlist, enqueue, details };
  const renderRow = useCallback(
    (row: Track[]) => (
      <div
        className="artwork-grid-row"
        style={{ gridTemplateColumns: `repeat(${columns},minmax(0,1fr))` }}
      >
        {row.map((t) => (
          <article
            key={t.id}
            onContextMenu={(e) => {
              e.preventDefault();
              actions.current.details(t);
            }}
            className={current === t.id ? "active" : ""}
          >
            <button
              className="grid-play"
              aria-label={"Play " + t.title}
              onClick={() => actions.current.play(t)}
            >
              <Cover track={t} />
              <strong>{t.title}</strong>
              <small>
                {t.artist}
                {t.missing ? " · Unavailable" : ""}
              </small>
            </button>
            <div className="grid-actions">
              <button
                className="icon"
                aria-label={"Song details for " + t.title}
                onClick={() => details(t)}
              >
                <Info size={15} />
              </button>
              <button
                className={"icon " + (favorites.has(t.id) ? "pink" : "")}
                aria-label={"Favorite " + t.title}
                onClick={() => actions.current.favorite(t.id)}
              >
                <Heart
                  size={15}
                  fill={favorites.has(t.id) ? "currentColor" : "none"}
                />
              </button>
              <button
                className="icon"
                aria-label={"Add " + t.title + " to playlist"}
                onClick={() => actions.current.playlist(t.id)}
              >
                <Plus size={16} />
              </button>
              <details className="song-queue-menu">
                <summary aria-label={"Queue options for " + t.title}>
                  <ListMusic size={16} />
                </summary>
                <div>
                  <button
                    onClick={(e) => {
                      actions.current.enqueue(t.id, true);
                      e.currentTarget
                        .closest("details")
                        ?.removeAttribute("open");
                    }}
                  >
                    Play next
                  </button>
                  <button
                    onClick={(e) => {
                      actions.current.enqueue(t.id);
                      e.currentTarget
                        .closest("details")
                        ?.removeAttribute("open");
                    }}
                  >
                    Add to queue
                  </button>
                </div>
              </details>
            </div>
          </article>
        ))}
      </div>
    ),
    [columns, current, favorites],
  );
  return (
    <div className="artwork-grid" ref={root}>
      <VirtualRows items={rows} height={285} overscan={2} render={renderRow} />
    </div>
  );
}
