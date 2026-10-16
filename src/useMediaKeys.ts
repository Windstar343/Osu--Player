import { useEffect, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Player } from "./useAudio";
export function useMediaKeys(player: Player, enabled: boolean) {
  const live = useRef(player);
  live.current = player;
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const handlers: Partial<
      Record<MediaSessionAction, MediaSessionActionHandler>
    > = {
      play: () => {
        if (!live.current.playing) live.current.toggle();
      },
      pause: () => {
        if (live.current.playing) live.current.toggle();
      },
      stop: () => {
        if (live.current.playing) live.current.toggle();
        live.current.seek(0);
      },
      previoustrack: () => live.current.step(-1),
      nexttrack: () => live.current.step(1),
      seekto: (e) => {
        if (e.seekTime !== undefined) live.current.seek(e.seekTime);
      },
      seekbackward: (e) =>
        live.current.seek(
          Math.max(0, live.current.position - (e.seekOffset || 10)),
        ),
      seekforward: (e) =>
        live.current.seek(
          Math.min(
            live.current.duration,
            live.current.position + (e.seekOffset || 10),
          ),
        ),
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try {
        session.setActionHandler(
          action as MediaSessionAction,
          enabled ? handler! : null,
        );
      } catch {
        /* Older WebView runtimes may not support every action. */
      }
    }
    return () => {
      for (const action of Object.keys(handlers))
        try {
          session.setActionHandler(action as MediaSessionAction, null);
        } catch {}
    };
  }, [enabled]);
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const track = player.current;
    session.metadata =
      enabled && track
        ? new MediaMetadata({
            title: track.title,
            artist: track.artist,
            album: "osu! Player",
            artwork: track.backgroundPath
              ? [{ src: convertFileSrc(track.backgroundPath) }]
              : [],
          })
        : null;
    session.playbackState =
      enabled && track ? (player.playing ? "playing" : "paused") : "none";
    if (enabled && player.duration > 0 && Number.isFinite(player.duration))
      try {
        session.setPositionState({
          duration: player.duration,
          position: Math.min(player.position, player.duration),
          playbackRate: player.rate,
        });
      } catch {}
  }, [
    enabled,
    player.current,
    player.playing,
    player.position,
    player.duration,
    player.rate,
  ]);
}
