import { FolderPlus, Music2 } from "lucide-react";
import { Logo } from "./Logo";
import { useLibrary } from "./useLibrary";
export function SourcesDialog({ lib }: { lib: ReturnType<typeof useLibrary> }) {
  return (
    <dialog
      ref={lib.sourceDialog}
      className="source-dialog"
      aria-labelledby="sources-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!lib.busy) lib.cancelSetup();
      }}
    >
      <div className="setup-heading">
        <Logo />
        <span className="eyebrow">SETUP</span>
      </div>
      <h2 id="sources-title">Music sources</h2>
      <p className="setup-intro">
        Bring your downloaded beatmaps into one library. Choose one or both.
      </p>
      <div className="source-choices">
        {lib.sources.map((source) => (
          <div
            key={source.kind}
            className={"source-choice " + (source.enabled ? "checked" : "")}
          >
            <label className="source-check">
              <input
                type="checkbox"
                checked={source.enabled}
                disabled={lib.busy}
                onChange={(e) =>
                  lib.setSources((prev) =>
                    prev.map((s) =>
                      s.kind === source.kind
                        ? { ...s, enabled: e.target.checked }
                        : s,
                    ),
                  )
                }
              />
              <div>
                <strong>
                  {source.kind === "stable" ? "osu! stable" : "osu!lazer"}
                </strong>
                <span>
                  {source.kind === "stable"
                    ? "Songs from osu! stable."
                    : "Songs from the local lazer library."}
                </span>
              </div>
              <span className={"detected " + (source.folder ? "found" : "")}>
                {source.folder ? "Located" : "Not found"}
              </span>
            </label>
            <div className="source-location">
              <p title={source.folder}>
                {source.folder.replace(/^\\\\\?\\/, "") ||
                  "Choose a folder to connect this library."}
              </p>
              <button
                className="folder-button"
                disabled={lib.busy}
                onClick={() => lib.browseSource(source.kind)}
              >
                <FolderPlus size={14} />
                {source.folder ? "Change" : "Browse"}
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="setup-note">
        Music stays on your PC. Shared audio appears once.
        <br />
        Change these choices anytime in Music sources.
      </p>
      {lib.setupError && (
        <div className="notice" role="alert">
          {lib.setupError}
        </div>
      )}
      <div className="setup-actions">
        <button
          className="text-button"
          disabled={lib.busy}
          onClick={lib.cancelSetup}
        >
          Not now
        </button>
        <button
          className="primary"
          disabled={lib.busy || !lib.sources.some((s) => s.enabled)}
          onClick={lib.saveSources}
        >
          <Music2 size={17} />
          {lib.busy ? "Loading your music…" : "Start listening"}
        </button>
      </div>
    </dialog>
  );
}
