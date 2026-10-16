import type { Settings } from "./model";

export type PlaybackMode = "normal" | "dt" | "nc" | "custom";

export const playbackModes: {
  id: PlaybackMode;
  label: string;
  short: string;
}[] = [
  { id: "normal", label: "Normal", short: "Normal" },
  { id: "dt", label: "Double Time", short: "DT" },
  { id: "nc", label: "Nightcore", short: "NC" },
  { id: "custom", label: "Custom speed", short: "Custom" },
];

export function playbackProfile(
  settings: Pick<Settings, "playbackMode" | "speed">,
) {
  const rate =
    settings.playbackMode === "normal"
      ? 1
      : settings.playbackMode === "custom"
        ? settings.speed
        : 1.5;
  return { rate, preservesPitch: settings.playbackMode !== "nc" };
}

/** Set pitch policy first, and keep the rate through media loads and track changes. */
export function applyPlaybackProfile(
  element: HTMLAudioElement,
  profile: ReturnType<typeof playbackProfile>,
) {
  element.preservesPitch = profile.preservesPitch;
  element.defaultPlaybackRate = profile.rate;
  element.playbackRate = profile.rate;
}
