import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Settings, Track, stored, persist } from "./model";
import { playbackProfile, applyPlaybackProfile } from "./playback";
export function useAudio(
  tracks: Track[],
  settings: Settings,
  onError: (message: string) => void,
  stopAfterSong = false,
  onSleepEnd?: () => void,
  onUnavailable?: (track: Track) => void,
) {
  const primary = useRef<HTMLAudioElement>(null);
  const spare = useRef<HTMLAudioElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const deckGains = useRef(new Map<HTMLAudioElement, GainNode>());
  const pendingSeek = useRef<number | null>(null);
  const transition = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restored = useRef(false);
  const transitionGeneration = useRef(0);
  const startPreloaded = useRef<(() => boolean) | null>(null);
  const queueRef = useRef<string[]>([]);
  const cursor = useRef(-1);
  const [queueIndex, setQueueIndex] = useState(-1);
  const nextChoice = useRef<string | null>(null);
  const [current, setCurrent] = useState<Track | null>(null);
  const currentRef = useRef<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => stored<number>("volume", 0.7));
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);
  queueRef.current = queue;
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const graph = useRef<{
    context: AudioContext;
    filters: BiquadFilterNode[];
    compressor: DynamicsCompressorNode;
    gain: GainNode;
  } | null>(null);
  const profile = playbackProfile(settings);
  function configure() {
    const g = graph.current;
    if (!g) return;
    g.filters.forEach((filter, i) => {
      filter.gain.value = settings.equalizer ? settings.eq[i] : 0;
    });
    const now = g.context.currentTime;
    g.gain.gain.cancelScheduledValues(now);
    g.gain.gain.setTargetAtTime(
      volume * (settings.equalizer ? Math.pow(10, -6 / 20) : 1),
      now,
      0.012,
    );
    g.compressor.threshold.value = settings.levelPeaks ? -18 : 0;
    g.compressor.ratio.value = settings.levelPeaks ? 4 : 1;
    g.compressor.knee.value = settings.levelPeaks ? 18 : 0;
  }
  async function prepareAudio() {
    if (!audio.current) return;
    if (!graph.current) {
      const context = new AudioContext({ latencyHint: "playback" });

      const frequencies = [60, 230, 910, 3600, 14000];
      const filters = frequencies.map((frequency, i) => {
        const filter = context.createBiquadFilter();
        filter.type = i === 0 ? "lowshelf" : i === 4 ? "highshelf" : "peaking";
        filter.frequency.value = frequency;
        filter.Q.value = 0.8;
        return filter;
      });
      const compressor = context.createDynamicsCompressor();
      const gain = context.createGain();
      gain.gain.value =
        volume * (settings.equalizer ? Math.pow(10, -6 / 20) : 1);
      for (const element of [primary.current, spare.current]) {
        if (!element) continue;
        const source = context.createMediaElementSource(element);
        const deckGain = context.createGain();
        deckGain.gain.value = element === audio.current ? 1 : 0;
        source.connect(deckGain);
        deckGain.connect(filters[0]);
        deckGains.current.set(element, deckGain);
        element.volume = 1;
      }
      filters.forEach((filter, i) =>
        filter.connect(filters[i + 1] || compressor),
      );
      compressor.connect(gain);
      gain.connect(context.destination);
      graph.current = {
        context,
        filters,
        compressor,
        gain,
      };
      audio.current.volume = 1;
      configure();
    }
    if (graph.current?.context.state === "suspended")
      await graph.current.context.resume();
  }
  useEffect(() => {
    configure();
    const element = audio.current;
    if (!element) return;
    const g = graph.current;
    const changed =
      element.playbackRate !== profile.rate ||
      element.preservesPitch !== profile.preservesPitch;
    const apply = () => {
      applyPlaybackProfile(element, profile);
      configure();
    };
    if (g && playing && changed) {
      const now = g.context.currentTime;
      g.gain.gain.cancelScheduledValues(now);
      g.gain.gain.setTargetAtTime(0, now, 0.004);
      const timer = setTimeout(apply, 25);
      return () => clearTimeout(timer);
    }
    apply();
  }, [
    profile.rate,
    profile.preservesPitch,
    settings.equalizer,
    settings.eq,
    settings.levelPeaks,
    playing,
  ]);
  useEffect(() => {
    persist("volume", volume);
    if (graph.current) {
      configure();
      if (audio.current) audio.current.volume = 1;
    } else if (audio.current) audio.current.volume = volume;
  }, [volume]);
  useEffect(() => {
    const previous = currentRef.current;
    if (previous && !tracks.some((t) => t.id === previous.id)) {
      cancelTransition();
      audio.current?.pause();
      currentRef.current = null;
      setCurrent(null);
      setPosition(0);
      setDuration(0);
    }
  }, [tracks]);
  function cancelTransition() {
    transitionGeneration.current++;
    startPreloaded.current = null;
    if (transition.current) clearTimeout(transition.current);
    transition.current = null;
    const now = graph.current?.context.currentTime || 0;
    for (const [element, gain] of deckGains.current) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(element === audio.current ? 1 : 0, now);
      if (element !== audio.current) element.pause();
    }
  }
  function updateQueue(ids: string[], index = cursor.current) {
    startPreloaded.current = null;
    queueRef.current = ids;
    cursor.current = index;
    setQueue(ids);
    setQueueIndex(index);
    nextChoice.current = null;
  }
  function enqueue(id: string, next = false) {
    const ids = [...queueRef.current];
    if (next) ids.splice(Math.max(0, cursor.current + 1), 0, id);
    else ids.push(id);
    updateQueue(ids);
  }
  function removeQueued(index: number) {
    if (index === cursor.current) return;
    updateQueue(
      queueRef.current.filter((_, i) => i !== index),
      cursor.current - (index < cursor.current ? 1 : 0),
    );
  }
  function moveQueued(from: number, to: number) {
    const ids = [...queueRef.current];
    if (from < 0 || to < 0 || from >= ids.length || to >= ids.length) return;
    const markers = ids.map((_, i) => i);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    markers.splice(to, 0, markers.splice(from, 1)[0]);
    updateQueue(ids, markers.indexOf(cursor.current));
  }
  async function play(track: Track, context?: string[], index?: number) {
    cancelTransition();
    const element = audio.current;
    if (!element) return;
    if (context) updateQueue(context, context.indexOf(track.id));
    else if (index !== undefined) updateQueue(queueRef.current, index);
    else if (!queueRef.current.includes(track.id)) updateQueue([track.id], 0);
    nextChoice.current = null;
    if (currentRef.current?.id !== track.id) {
      element.src = convertFileSrc(track.audioPath);
      currentRef.current = track;
      setCurrent(track);
      setPosition(0);
      setDuration(0);
    }
    applyPlaybackProfile(element, profile);
    try {
      await prepareAudio();
      await element.play();
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        onError(
          "Could not play this file. It may have moved or use an unsupported format.",
        );
    }
  }
  function step(direction: number) {
    const byId = new Map(tracksRef.current.map((t) => [t.id, t]));
    const ids = queueRef.current.length
      ? queueRef.current
      : tracksRef.current.map((t) => t.id);
    const ordered = ids
      .map((id, index) => ({ track: byId.get(id), index }))
      .filter((x) => x.track);
    if (!ordered.length) return;
    if (direction < 0 && (audio.current?.currentTime || 0) > 3) {
      seek(0);
      return;
    }
    const index = ordered.findIndex((t) => t.index === cursor.current);
    let next = (index + direction + ordered.length) % ordered.length;
    if (index < 0) next = 0;
    else if (shuffle && ordered.length > 1)
      next =
        (index + 1 + Math.floor(Math.random() * (ordered.length - 1))) %
        ordered.length;
    void play(ordered[next].track!, undefined, ordered[next].index);
  }
  function toggle() {
    if (playing) {
      cancelTransition();
      audio.current?.pause();
    } else if (currentRef.current) void play(currentRef.current);
    else if (tracksRef.current[0])
      void play(
        tracksRef.current[0],
        tracksRef.current.map((t) => t.id),
      );
  }
  function seek(value: number) {
    if (audio.current && Number.isFinite(value)) {
      cancelTransition();
      audio.current.currentTime = value;
      setPosition(value);
    }
  }
  useEffect(() => {
    if (stopAfterSong) cancelTransition();
  }, [stopAfterSong]);
  function ended() {
    if (stopAfterSong) {
      cancelTransition();
      audio.current?.pause();
      setPlaying(false);
      onSleepEnd?.();
      return;
    }
    if (transition.current || startPreloaded.current?.()) return;
    if (repeat && currentRef.current) {
      seek(0);
      void play(currentRef.current);
    } else step(1);
  }
  const live = useRef({
    settings,
    profile,
    playing,
    shuffle,
    repeat,
    ended,
    stopAfterSong,
  });
  live.current = {
    settings,
    profile,
    playing,
    shuffle,
    repeat,
    ended,
    stopAfterSong,
  };
  useEffect(() => {
    audio.current = primary.current;
    const elements = [primary.current!, spare.current!];
    const handlers: [string, EventListener][] = [
      [
        "play",
        (e) => {
          if (e.target === audio.current) setPlaying(true);
        },
      ],
      [
        "pause",
        (e) => {
          if (e.target === audio.current) setPlaying(false);
        },
      ],
      [
        "timeupdate",
        (e) => {
          if (e.target === audio.current)
            setPosition(audio.current?.currentTime || 0);
        },
      ],
      [
        "loadedmetadata",
        (e) => {
          const element = e.target as HTMLAudioElement;
          applyPlaybackProfile(element, live.current.profile);
          if (element === audio.current) {
            setDuration(element.duration || 0);
            if (pendingSeek.current !== null) {
              element.currentTime = Math.min(
                pendingSeek.current,
                Math.max(0, element.duration - 0.1),
              );
              setPosition(element.currentTime);
              pendingSeek.current = null;
            }
          }
        },
      ],
      [
        "ended",
        (e) => {
          if (e.target === audio.current) live.current.ended();
        },
      ],
      [
        "error",
        (e) => {
          if (e.target === audio.current) {
            setPlaying(false);
            onError(
              "Unable to play this audio file. Open Song details to check its location.",
            );
            if (currentRef.current) onUnavailable?.(currentRef.current);
          }
        },
      ],
    ];
    for (const element of elements)
      for (const [name, handler] of handlers)
        element.addEventListener(name, handler);
    // Keep the next decoder warm. Fade scheduling uses the audio clock; the
    // handoff itself depends on the media decoder and is not sample accurate.
    let prepared: {
      active: HTMLAudioElement;
      tracks: Track[];
      queue: string[];
      cursor: number;
      shuffle: boolean;
      repeat: boolean;
      track: Track;
      index: number;
    } | null = null;
    const timer = setInterval(() => {
      const active = audio.current;
      if (!active || !currentRef.current || transition.current) return;
      const state = live.current;
      if (state.stopAfterSong) {
        startPreloaded.current = null;
        return;
      }
      if (!state.settings.gapless && !state.settings.crossfade) {
        startPreloaded.current = null;
        return;
      }
      if (
        !prepared ||
        prepared.active !== active ||
        prepared.tracks !== tracksRef.current ||
        prepared.queue !== queueRef.current ||
        prepared.cursor !== cursor.current ||
        prepared.shuffle !== state.shuffle ||
        prepared.repeat !== state.repeat
      ) {
        const ids = queueRef.current;
        const available = new Set(tracksRef.current.map((t) => t.id));
        const candidates = ids
          .map((id, index) => ({ id, index }))
          .filter((x) => available.has(x.id));
        if (!candidates.length) return;
        let next = state.repeat
          ? candidates.find((x) => x.index === cursor.current)
          : undefined;
        if (!next && state.shuffle) {
          const choices = candidates.filter((x) => x.index !== cursor.current);
          next =
            choices.find((x) => x.id === nextChoice.current) ||
            choices[Math.floor(Math.random() * choices.length)];
        }
        if (!next)
          next =
            candidates.find((x) => x.index > cursor.current) || candidates[0];
        nextChoice.current = next.id;
        const track = tracksRef.current.find((t) => t.id === next.id);
        if (!track) return;
        prepared = {
          active,
          tracks: tracksRef.current,
          queue: ids,
          cursor: cursor.current,
          shuffle: state.shuffle,
          repeat: state.repeat,
          track,
          index: next.index,
        };
      }
      const { track, index: nextIndex } = prepared;
      const standby =
        active === primary.current ? spare.current! : primary.current!;
      const url = convertFileSrc(track.audioPath);
      if (standby.getAttribute("src") !== url) {
        standby.src = url;
        standby.preload = "auto";
        standby.load();
      }
      applyPlaybackProfile(standby, state.profile);
      const remaining =
        (active.duration - active.currentTime) / state.profile.rate;
      const fade = Math.min(
        state.settings.crossfade,
        active.duration / state.profile.rate / 2,
      );
      startPreloaded.current = () => {
        if (
          audio.current !== active ||
          standby.readyState < 3 ||
          !graph.current ||
          transition.current
        )
          return false;
        const token = ++transitionGeneration.current;
        const outgoing = active;
        const incoming = standby;
        transition.current = setTimeout(() => {
          if (token === transitionGeneration.current) cancelTransition();
        }, 5000);
        incoming.currentTime = 0;
        void incoming
          .play()
          .then(() => {
            if (token !== transitionGeneration.current || !transition.current)
              return;
            const g = graph.current!;
            const now = g.context.currentTime;
            const seconds = Math.max(0.008, Math.min(fade, remaining));
            const oldGain = deckGains.current.get(outgoing)!;
            const newGain = deckGains.current.get(incoming)!;
            oldGain.gain.cancelScheduledValues(now);
            newGain.gain.cancelScheduledValues(now);
            oldGain.gain.setValueAtTime(1, now);
            newGain.gain.setValueAtTime(0, now);
            oldGain.gain.linearRampToValueAtTime(0, now + seconds);
            newGain.gain.linearRampToValueAtTime(1, now + seconds);
            audio.current = incoming;
            currentRef.current = track;
            setCurrent(track);
            setPlaying(true);
            setPosition(0);
            setDuration(incoming.duration);
            cursor.current = nextIndex;
            setQueueIndex(nextIndex);
            nextChoice.current = null;
            clearTimeout(transition.current!);
            transition.current = setTimeout(() => {
              outgoing.pause();
              transition.current = null;
            }, seconds * 1000);
          })
          .catch(() => {
            if (token !== transitionGeneration.current) return;
            clearTimeout(transition.current!);
            transition.current = null;
            startPreloaded.current = null;
            live.current.ended();
          });
        return true;
      };
      if (
        state.playing &&
        Number.isFinite(remaining) &&
        remaining <= Math.max(fade, 0.045)
      )
        startPreloaded.current();
    }, 25);
    return () => {
      clearInterval(timer);
      cancelTransition();
      for (const element of elements) element.pause();
      void graph.current?.context.close();
      graph.current = null;
      deckGains.current.clear();
      for (const element of elements)
        for (const [name, handler] of handlers)
          element.removeEventListener(name, handler);
    };
  }, []);
  useEffect(() => {
    if (restored.current || !tracks.length) return;
    restored.current = true;
    if (!settings.rememberSession) return;
    const session = stored<{
      id: string;
      position: number;
      queue: string[];
      cursor: number;
      shuffle: boolean;
      repeat: boolean;
    } | null>("sessionV1", null);
    if (!session) return;
    const track = tracks.find((t) => t.id === session.id);
    if (!track || !audio.current) return;
    const valid = new Set(tracks.map((t) => t.id));
    const savedQueue = Array.isArray(session.queue)
      ? session.queue.filter((id) => valid.has(id))
      : [track.id];
    const originalIndex = Number.isInteger(session.cursor) ? session.cursor : 0;
    const index =
      session.queue?.slice(0, originalIndex).filter((id) => valid.has(id))
        .length || 0;
    updateQueue(
      savedQueue,
      savedQueue[index] === track.id ? index : savedQueue.indexOf(track.id),
    );
    currentRef.current = track;
    setCurrent(track);
    setShuffle(!!session.shuffle);
    setRepeat(!!session.repeat);
    pendingSeek.current = Number.isFinite(session.position)
      ? Math.max(0, session.position)
      : 0;
    audio.current.src = convertFileSrc(track.audioPath);
    audio.current.load();
  }, [tracks, settings.rememberSession]);
  useEffect(() => {
    function save() {
      if (!settings.rememberSession) {
        localStorage.removeItem("sessionV1");
        return;
      }
      if (!currentRef.current || !restored.current) return;
      persist("sessionV1", {
        id: currentRef.current.id,
        position: pendingSeek.current ?? (audio.current?.currentTime || 0),
        queue: queueRef.current,
        cursor: cursor.current,
        shuffle,
        repeat,
      });
    }
    save();
    const timer = setInterval(save, 2000);
    window.addEventListener("pagehide", save);
    return () => {
      save();
      clearInterval(timer);
      window.removeEventListener("pagehide", save);
    };
  }, [settings.rememberSession, current, playing, queue, shuffle, repeat]);
  return {
    audio,
    primary,
    spare,

    current,
    playing,
    position,
    duration,
    rate: profile.rate,
    volume,
    setVolume,
    shuffle,
    setShuffle,
    repeat,
    setRepeat,
    queue,
    queueIndex,
    enqueue,
    removeQueued,
    moveQueued,
    clearQueue: () =>
      updateQueue(
        currentRef.current ? [currentRef.current.id] : [],
        currentRef.current ? 0 : -1,
      ),
    playQueued: (index: number) => {
      const track = tracksRef.current.find(
        (t) => t.id === queueRef.current[index],
      );
      if (track) void play(track, undefined, index);
    },
    play,
    toggle,
    step,
    seek,
    ended,
    events: {},
  };
}
export type Player = ReturnType<typeof useAudio>;
