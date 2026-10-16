import { FolderPlus, RefreshCw, RotateCcw } from "lucide-react";
import { Settings } from "./model";
import { PlaybackModes } from "./PlaybackModes";
import { DiscordSettings } from "./DiscordSettings";
type Props = {
  exportBackup: () => void;
  importBackup: () => void;
  discordStatus: string;
  settings: Settings;
  update: (value: Partial<Settings>) => void;
  lastRefresh: number | null;
  busy: boolean;
  rescan: () => void;
  sources: () => void;
};
export function SettingsView({
  settings,
  update,
  exportBackup,
  importBackup,
  discordStatus,
  lastRefresh,
  busy,
  rescan,
  sources,
}: Props) {
  const toggle = (
    key:
      | "autoRefresh"
      | "closeToTray"
      | "minimizeToTray"
      | "compact"
      | "reducedMotion"
      | "equalizer"
      | "levelPeaks"
      | "rememberSession"
      | "mediaKeys"
      | "miniOnTop"
      | "gapless",
    label: string,
    description: string,
  ) => (
    <label className="setting-row">
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      <input
        className="switch"
        type="checkbox"
        aria-label={label}
        checked={settings[key]}
        onChange={(e) => update({ [key]: e.target.checked })}
      />
    </label>
  );
  return (
    <section className="settings-view">
      <div className="page-heading">
        <div className="eyebrow">PREFERENCES</div>
        <h1>Settings</h1>
        <p>Library, playback, and window preferences.</p>
      </div>
      <section className="settings-card">
        <h2>Library</h2>
        {toggle(
          "autoRefresh",
          "Automatic refresh",
          "Check for new, changed, and removed downloaded beatmaps in the background.",
        )}
        <div className="setting-row">
          <div>
            <strong>Check for changes</strong>
            <p>
              {lastRefresh
                ? "Last scan: " +
                  new Date(lastRefresh).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Your selected libraries will appear here."}
            </p>
          </div>
          <select
            aria-label="Refresh interval"
            value={settings.refreshSeconds}
            disabled={!settings.autoRefresh}
            onChange={(e) => update({ refreshSeconds: Number(e.target.value) })}
          >
            <option value={15}>Every 15 seconds</option>
            <option value={30}>Every 30 seconds</option>
            <option value={60}>Every minute</option>
            <option value={300}>Every 5 minutes</option>
          </select>
        </div>
        <div className="settings-actions">
          <button className="folder-button" disabled={busy} onClick={sources}>
            <FolderPlus size={16} />
            Music sources
          </button>
          <button className="folder-button" disabled={busy} onClick={rescan}>
            <RefreshCw size={15} className={busy ? "spin" : ""} />
            {busy ? "Refreshing…" : "Refresh now"}
          </button>
        </div>
      </section>
      <section className="settings-card">
        <h2>Window & appearance</h2>
        <label className="setting-row">
          <div>
            <strong>Accent color</strong>
            <p>
              Match the playing song’s artwork or keep the fixed pink theme.
            </p>
          </div>
          <select
            aria-label="Accent color"
            value={settings.theme}
            onChange={(e) =>
              update({ theme: e.target.value as Settings["theme"] })
            }
          >
            <option value="artwork">From artwork</option>
            <option value="pink">Fixed pink</option>
          </select>
        </label>
        {toggle(
          "miniOnTop",
          "Keep mini-player on top",
          "Pin the small player above other windows.",
        )}
        {toggle(
          "rememberSession",
          "Remember playback session",
          "Restore your song, position, queue, shuffle, and repeat when opening. Playback stays paused.",
        )}
        {toggle(
          "mediaKeys",
          "Windows media controls",
          "Control playback with media keys while using other apps. Play/pause, next, previous, and stop work while the window is in the background.",
        )}
        {toggle(
          "closeToTray",
          "Keep playing when the window closes",
          "Close hides the player in the system tray. Use the tray menu to quit.",
        )}
        {toggle(
          "minimizeToTray",
          "Minimize to the system tray",
          "Hide the taskbar window when minimizing. Click the tray icon to bring it back.",
        )}
        {toggle(
          "compact",
          "Compact song rows",
          "Fit more of your collection on screen.",
        )}
        {toggle(
          "reducedMotion",
          "Reduce motion",
          "Turn off decorative animation in Now Playing.",
        )}
      </section>
      <DiscordSettings
        settings={settings}
        update={update}
        status={discordStatus}
      />
      <section className="settings-card">
        <h2>Audio</h2>
        {toggle(
          "gapless",
          "Gapless transitions",
          "Prepare the next song to minimize the gap between tracks. Decoder timing can vary by file format.",
        )}
        <label className="setting-row">
          <div>
            <strong>Crossfade</strong>
            <p>
              Overlap the end of one song with the next. Off keeps transitions
              unblended.
            </p>
          </div>
          <select
            aria-label="Crossfade"
            value={settings.crossfade}
            onChange={(e) => update({ crossfade: Number(e.target.value) })}
          >
            {[0, 1, 2, 3, 5, 8, 10].map((v) => (
              <option key={v} value={v}>
                {v ? `${v} seconds` : "Off"}
              </option>
            ))}
          </select>
        </label>
        <PlaybackModes settings={settings} onChange={update} />
        <p className="mode-explanation">
          DT: 1.5×, original pitch. NC: 1.5×, higher pitch. No added sounds.
        </p>
        <div className="setting-row">
          <div>
            <strong>Playback speed</strong>
            <p>Choose a custom speed with the original pitch.</p>
          </div>
          <select
            aria-label="Playback speed"
            value={settings.speed}
            onChange={(e) =>
              update({ speed: Number(e.target.value), playbackMode: "custom" })
            }
          >
            {[0.5, 0.75, 1, 1.1, 1.25, 1.5, 2].map((speed) => (
              <option key={speed} value={speed}>
                {speed}×{speed === 1 ? " · Normal" : ""}
              </option>
            ))}
          </select>
        </div>
        {toggle(
          "levelPeaks",
          "Reduce loud peaks",
          "Gently compress louder passages. This does not measure or normalize every song.",
        )}
        {toggle(
          "equalizer",
          "Equalizer",
          "Five bands to shape your sound. A little headroom helps prevent clipping.",
        )}
        <div className={"equalizer " + (!settings.equalizer ? "disabled" : "")}>
          <div className="eq-presets">
            {Object.entries({
              Flat: [0, 0, 0, 0, 0],
              "Bass boost": [6, 3, 0, 0, -1],
              Vocals: [-2, -1, 4, 2, -1],
              Electronic: [4, 1, -2, 3, 4],
            }).map(([label, eq]) => (
              <button
                key={label}
                disabled={!settings.equalizer}
                className={
                  "chip " +
                  (JSON.stringify(settings.eq) === JSON.stringify(eq)
                    ? "chosen"
                    : "")
                }
                onClick={() => update({ eq })}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="eq-bands">
            {["60 Hz", "230 Hz", "910 Hz", "3.6 kHz", "14 kHz"].map(
              (label, i) => (
                <label key={label}>
                  <span>{label}</span>
                  <input
                    aria-label={label + " gain"}
                    disabled={!settings.equalizer}
                    type="range"
                    min={-12}
                    max={12}
                    step={1}
                    value={settings.eq[i]}
                    onChange={(e) =>
                      update({
                        eq: settings.eq.map((v, j) =>
                          j === i ? Number(e.target.value) : v,
                        ),
                      })
                    }
                  />
                  <small>
                    {settings.eq[i] > 0 ? "+" : ""}
                    {settings.eq[i]} dB
                  </small>
                </label>
              ),
            )}
          </div>
        </div>
        <button
          className="text-button reset-audio"
          onClick={() =>
            update({
              speed: 1,
              playbackMode: "normal",
              equalizer: false,
              eq: [0, 0, 0, 0, 0],
              levelPeaks: false,
              crossfade: 0,
              gapless: true,
            })
          }
        >
          <RotateCcw size={13} />
          Reset audio settings
        </button>
      </section>
      <section className="settings-card">
        <h2>Playlist backup</h2>
        <p>
          Save playlists as JSON. Import adds copies and matches songs by
          metadata if folders have moved. Audio files are not included.
        </p>
        <div className="settings-actions">
          <button className="folder-button" onClick={exportBackup}>
            Export playlists
          </button>
          <button className="folder-button" onClick={importBackup}>
            Import playlists
          </button>
        </div>
      </section>
      <p className="settings-footnote">
        Changes save automatically on this PC. Your osu! files stay untouched.
      </p>
    </section>
  );
}
