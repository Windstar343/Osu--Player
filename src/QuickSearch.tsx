import { useEffect, useMemo, useRef, useState } from "react";
import { Track } from "./model";
import { Cover } from "./PlayerViews";
import { Search, X } from "lucide-react";
export function QuickSearch({
  tracks,
  play,
}: {
  tracks: Track[];
  play: (track: Track, ids: string[]) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(""),
    [selected, setSelected] = useState(0);
  const matches = useMemo(() => {
    const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return tracks.filter((t) =>
      terms.every((term) =>
        `${t.title} ${t.artist} ${t.creator}`
          .toLocaleLowerCase()
          .includes(term),
      ),
    );
  }, [tracks, query]);
  const results = matches.slice(0, 60);
  const open = () => {
    setQuery("");
    setSelected(0);
    if (!dialog.current?.open) dialog.current?.showModal();
    input.current?.focus();
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyK") {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  function choose(track: Track) {
    play(
      track,
      matches.map((t) => t.id),
    );
    dialog.current?.close();
  }
  return (
    <>
      <button
        className="icon"
        aria-label="Quick search"
        title="Quick search (Ctrl+K)"
        onClick={open}
      >
        <Search size={17} />
      </button>
      <dialog
        className="quick-search"
        ref={dialog}
        aria-label="Quick search"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const next = Math.max(
              0,
              Math.min(
                results.length - 1,
                selected + (e.key === "ArrowDown" ? 1 : -1),
              ),
            );
            setSelected(next);
            dialog.current
              ?.querySelector(`[data-result="${next}"]`)
              ?.scrollIntoView({ block: "nearest" });
          }
          if (e.key === "Enter" && results[selected]) {
            e.preventDefault();
            choose(results[selected]);
          }
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <div className="quick-search-input">
          <Search size={20} />
          <input
            ref={input}
            aria-label="Find a song"
            placeholder="Search songs, artists, or mappers"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
          />
          <kbd>Ctrl K</kbd>
          <button
            className="icon"
            aria-label="Close quick search"
            onClick={() => dialog.current?.close()}
          >
            <X size={18} />
          </button>
        </div>
        <div className="quick-results">
          {results.map((t, i) => (
            <button
              key={t.id}
              data-result={i}
              className={i === selected ? "selected" : ""}
              onClick={() => choose(t)}
            >
              <Cover track={t} />
              <span>
                <strong>{t.title}</strong>
                <small>{t.artist}</small>
              </span>
              <small>{t.creator}</small>
            </button>
          ))}
          {!results.length && <p>No matching songs.</p>}
        </div>
        <p className="quick-hint">
          ↑ ↓ to choose · Enter to play · Escape to close
          {matches.length > 60
            ? " · First 60 matches; type to narrow results"
            : ""}
        </p>
      </dialog>
    </>
  );
}
