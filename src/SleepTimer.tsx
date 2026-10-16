import { useEffect, useRef, useState } from "react";
import { Player } from "./useAudio";
import { Timer } from "lucide-react";
export function useSleepTimer(player: React.RefObject<Player | null>) {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [afterSong, setAfterSong] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [status, setStatus] = useState("");
  const cancel = () => {
    setDeadline(null);
    setAfterSong(false);
    setRemaining(0);
  };
  const finish = () => {
    cancel();
    setStatus("Sleep timer finished. Playback paused.");
  };
  const live = useRef({ player, finish });
  live.current = { player, finish };
  useEffect(() => {
    if (deadline === null) return;
    const check = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (!left) {
        const p = live.current.player.current;
        if (p?.playing) p.toggle();
        live.current.finish();
      }
    };
    check();
    const interval = setInterval(check, 250);
    return () => clearInterval(interval);
  }, [deadline]);
  return {
    afterSong,
    remaining,
    active: afterSong || deadline !== null,
    status,
    cancel,
    start: (minutes: number) => {
      setAfterSong(false);
      setStatus("");
      setRemaining(minutes * 60);
      setDeadline(Date.now() + minutes * 60000);
    },
    endOfSong: () => {
      setDeadline(null);
      setStatus("");
      setAfterSong(true);
    },
    finish,
  };
}
export type SleepTimer = ReturnType<typeof useSleepTimer>;
export function SleepTimerControl({ timer }: { timer: SleepTimer }) {
  return (
    <details className="sleep-timer utility-popover">
      <summary aria-label="Sleep timer" title="Sleep timer">
        <Timer size={17} />
        {timer.active && (
          <span>
            {timer.afterSong ? "End" : `${Math.ceil(timer.remaining / 60)}m`}
          </span>
        )}
      </summary>
      <div>
        <strong>Sleep timer</strong>
        <p>
          {timer.afterSong
            ? "Pauses when this song ends."
            : timer.active
              ? `${Math.floor(timer.remaining / 60)}:${String(timer.remaining % 60).padStart(2, "0")} remaining`
              : "Pause playback automatically."}
        </p>
        {[15, 30, 45, 60, 90].map((m) => (
          <button
            key={m}
            onClick={(e) => {
              timer.start(m);
              e.currentTarget.closest("details")?.removeAttribute("open");
            }}
          >
            {m} minutes
          </button>
        ))}
        <button
          onClick={(e) => {
            timer.endOfSong();
            e.currentTarget.closest("details")?.removeAttribute("open");
          }}
        >
          End of current song
        </button>
        {timer.active && <button onClick={timer.cancel}>Cancel timer</button>}
        {timer.status && <p role="status">{timer.status}</p>}
      </div>
    </details>
  );
}
