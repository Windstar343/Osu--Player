import type { PlaybackMode } from "./playback";
export type Track = {
  id: string;
  title: string;
  artist: string;
  creator: string;
  audioPath: string;
  backgroundPath?: string;
  sources: string[];
  modes: number[];
  beatmapSetId?: number;
};
export type Source = {
  kind: "stable" | "lazer";
  folder: string;
  enabled: boolean;
};
export type Playlist = { id: string; name: string; trackIds: string[] };
export type Settings = {
  autoRefresh: boolean;
  refreshSeconds: number;
  closeToTray: boolean;
  minimizeToTray: boolean;
  compact: boolean;
  reducedMotion: boolean;
  speed: number;
  playbackMode: PlaybackMode;
  discordPresence: boolean;
  equalizer: boolean;
  eq: number[];
  levelPeaks: boolean;
  rememberSession: boolean;
  mediaKeys: boolean;
  miniOnTop: boolean;
  gapless: boolean;
  crossfade: number;
  theme: "artwork" | "pink";
};
export const defaultSettings: Settings = {
  autoRefresh: true,
  refreshSeconds: 30,
  closeToTray: true,
  minimizeToTray: false,
  compact: false,
  reducedMotion: false,
  speed: 1,
  playbackMode: "normal",
  discordPresence: false,
  equalizer: false,
  eq: [0, 0, 0, 0, 0],
  levelPeaks: false,
  rememberSession: true,
  mediaKeys: true,
  miniOnTop: true,
  gapless: true,
  crossfade: 0,
  theme: "artwork",
};
export const modes = ["osu!", "taiko", "catch", "mania"];
export function stored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export function persist(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}
export const time = (s: number) =>
  Number.isFinite(s)
    ? Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0")
    : "0:00";
