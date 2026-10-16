import { playbackModes, playbackProfile } from "./playback";
import type { Settings } from "./model";

export function PlaybackModes({
  settings,
  onChange,
  compact = false,
}: {
  settings: Settings;
  onChange: (change: Partial<Settings>) => void;
  compact?: boolean;
}) {
  if (compact)
    return (
      <select
        className="playback-mode-select"
        aria-label="Playback mode"
        value={settings.playbackMode}
        onChange={(e) =>
          onChange({ playbackMode: e.target.value as Settings["playbackMode"] })
        }
      >
        {playbackModes.map((mode) => (
          <option key={mode.id} value={mode.id}>
            {mode.short}
          </option>
        ))}
      </select>
    );
  return (
    <div className="playback-modes" role="group" aria-label="Playback mode">
      {playbackModes.map((mode) => {
        const profile = playbackProfile({ ...settings, playbackMode: mode.id });
        return (
          <button
            key={mode.id}
            aria-label={mode.label}
            aria-pressed={settings.playbackMode === mode.id}
            className={settings.playbackMode === mode.id ? "selected" : ""}
            onClick={() => onChange({ playbackMode: mode.id })}
          >
            <strong>{mode.short}</strong>
            <small>
              {profile.rate}× ·{" "}
              {profile.preservesPitch ? "Original pitch" : "Higher pitch"}
            </small>
          </button>
        );
      })}
    </div>
  );
}
