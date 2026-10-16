import { useEffect, useMemo, useRef, useState } from "react";
import { Heart, ListMusic, Plus } from "lucide-react";
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
}: {
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
  return (
    <div className="artwork-grid" ref={root}>
      <VirtualRows
        items={rows}
        height={285}
        render={(row) => (
          <div
            className="artwork-grid-row"
            style={{ gridTemplateColumns: `repeat(${columns},minmax(0,1fr))` }}
          >
            {row.map((t) => (
              <article key={t.id} className={current === t.id ? "active" : ""}>
                <button
                  className="grid-play"
                  aria-label={"Play " + t.title}
                  onClick={() => play(t)}
                >
                  <Cover track={t} />
                  <strong>{t.title}</strong>
                  <small>{t.artist}</small>
                </button>
                <div className="grid-actions">
                  <button
                    className={"icon " + (favorites.has(t.id) ? "pink" : "")}
                    aria-label={"Favorite " + t.title}
                    onClick={() => favorite(t.id)}
                  >
                    <Heart
                      size={15}
                      fill={favorites.has(t.id) ? "currentColor" : "none"}
                    />
                  </button>
                  <button
                    className="icon"
                    aria-label={"Add " + t.title + " to playlist"}
                    onClick={() => playlist(t.id)}
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
                          enqueue(t.id, true);
                          e.currentTarget
                            .closest("details")
                            ?.removeAttribute("open");
                        }}
                      >
                        Play next
                      </button>
                      <button
                        onClick={(e) => {
                          enqueue(t.id);
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
        )}
      />
    </div>
  );
}
