import type { Settings } from "./model";
export function DiscordSettings({
  settings,
  update,
  status,
}: {
  settings: Settings;
  update: (value: Partial<Settings>) => void;
  status: string;
}) {
  return (
    <section className="settings-card">
      <h2>Discord</h2>
      <label className="setting-row">
        <div>
          <strong>Show current song on Discord</strong>
          <p>
            Share the song title and artist while you listen. Off by default.
          </p>
        </div>
        <input
          className="switch"
          type="checkbox"
          aria-label="Show current song on Discord"
          checked={settings.discordPresence}
          onChange={(e) => update({ discordPresence: e.target.checked })}
        />
      </label>
      <p className="presence-status" role="status">
        <span
          className={settings.discordPresence ? "local-dot" : "offline-dot"}
        />
        {status}
      </p>
      <p className="mode-explanation">
        Requires the Discord desktop app and activity sharing enabled in
        Discord. Pausing or turning this off clears the activity. Covers use
        public osu! artwork; local-only or unavailable covers show the player
        logo. Local artwork is never uploaded.
      </p>
    </section>
  );
}
