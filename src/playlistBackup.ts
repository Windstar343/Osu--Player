import { Playlist, Track } from "./model";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
type Song = Pick<Track, "id" | "title" | "artist" | "beatmapSetId">;
export function makeBackup(playlists: Playlist[], tracks: Track[]) {
  const included = new Set(playlists.flatMap((p) => p.trackIds));
  return JSON.stringify(
    {
      format: "osu-player-playlists",
      version: 1,
      playlists,
      songs: tracks
        .filter((t) => included.has(t.id))
        .map(({ id, title, artist, beatmapSetId }) => ({
          id,
          title,
          artist,
          beatmapSetId,
        })),
    },
    null,
    2,
  );
}
export function readBackup(text: string, tracks: Track[]): Playlist[] {
  const data = JSON.parse(text);
  if (
    data?.format !== "osu-player-playlists" ||
    data.version !== 1 ||
    !Array.isArray(data.playlists) ||
    data.playlists.length > 10000 ||
    !Array.isArray(data.songs)
  )
    throw new Error("This is not a supported osu! Player playlist backup.");
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const key = (t: Song) =>
    JSON.stringify([t.title.toLowerCase(), t.artist.toLowerCase()]);
  const bySong = new Map<string, Track[]>();
  for (const track of tracks)
    bySong.set(key(track), [...(bySong.get(key(track)) || []), track]);
  const matches = new Map<string, string>();
  for (const song of data.songs) {
    if (
      !song ||
      typeof song.id !== "string" ||
      typeof song.title !== "string" ||
      typeof song.artist !== "string"
    )
      throw new Error("Invalid song in backup.");
    const choices = bySong.get(key(song)) || [];
    const match =
      byId.get(song.id) ||
      choices.find(
        (t) => song.beatmapSetId && t.beatmapSetId === song.beatmapSetId,
      ) ||
      (choices.length === 1 ? choices[0] : undefined);
    if (match) matches.set(song.id, match.id);
  }
  return data.playlists.map((p: Playlist) => {
    if (
      !p ||
      typeof p.name !== "string" ||
      !p.name.trim() ||
      p.name.length > 200 ||
      !Array.isArray(p.trackIds) ||
      p.trackIds.length > 100000 ||
      !p.trackIds.every((id) => typeof id === "string")
    )
      throw new Error("Invalid playlist in backup.");
    return {
      id: crypto.randomUUID(),
      name: p.name.trim(),
      trackIds: [...new Set(p.trackIds.map((id) => matches.get(id) || id))],
    };
  });
}
export async function exportPlaylists(playlists: Playlist[], tracks: Track[]) {
  const path = await save({
    title: "Export playlists",
    defaultPath: "osu-player-playlists.json",
    filters: [{ name: "Playlist backup", extensions: ["json"] }],
  });
  if (!path) return false;
  await invoke("write_playlist_backup", {
    path,
    content: makeBackup(playlists, tracks),
  });
  return true;
}
export async function importPlaylists(tracks: Track[]) {
  const path = await open({
    title: "Import playlists",
    multiple: false,
    filters: [{ name: "Playlist backup", extensions: ["json"] }],
  });
  if (typeof path !== "string") return null;
  return readBackup(
    await invoke<string>("read_playlist_backup", { path }),
    tracks,
  );
}
