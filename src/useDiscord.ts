import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Player } from "./useAudio";
import type { Settings } from "./model";

export function useDiscord(player: Player, settings: Settings) {
  const [status, setStatus] = useState("Off");
  const snapshot = useRef(player);
  snapshot.current = player;
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    async function sync() {
      const current = snapshot.current;
      try {
        await invoke("update_discord", {
          presence: settings.discordPresence
            ? {
                enabled: true,
                title: current.current?.title || "",
                artist: current.current?.artist || "",
                mode: settings.playbackMode,
                playing: current.playing,
                position: current.position,
                duration: current.duration,
                rate: current.rate,
                beatmapSetId: current.current?.beatmapSetId,
              }
            : { enabled: false },
        });
        const next = await invoke<string>("discord_status");
        if (!cancelled) setStatus(next || "Waiting for Discord");
      } catch {
        if (!cancelled) setStatus("Discord presence is unavailable");
      }
    }
    void sync();
    const interval = settings.discordPresence
      ? setInterval(sync, 10000)
      : undefined;
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [
    settings.discordPresence,
    settings.playbackMode,
    player.current?.id,
    player.playing,
    player.rate,
    Math.floor(player.position / 10),
  ]);
  useEffect(() => {
    if (!isTauri() || !settings.discordPresence) return;
    let cancelled = false;
    const timer = setInterval(
      () =>
        void invoke<string>("discord_status")
          .then((value) => {
            if (!cancelled) setStatus(value);
          })
          .catch(() => {}),
      3000,
    );
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [settings.discordPresence]);
  return settings.discordPresence ? status : "Off";
}
