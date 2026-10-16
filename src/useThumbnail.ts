import { useEffect, useState } from "react";
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
const cache = new Map<string, Promise<string | undefined>>();
const jobs: (() => Promise<void>)[] = [];
let running = 0;
function pump() {
  while (running < 2 && jobs.length) {
    const job = jobs.shift()!;
    running++;
    void job().finally(() => {
      running--;
      pump();
    });
  }
}
function thumbnail(path: string) {
  const found = cache.get(path);
  if (found) return found;
  const pending = new Promise<string | undefined>((resolve) => {
    jobs.push(async () => {
      try {
        const result = await invoke<string>("artwork_thumbnail", { path });
        resolve(result ? convertFileSrc(result) : undefined);
      } catch {
        resolve(undefined);
      }
    });
    pump();
  });
  if (cache.size >= 256) cache.delete(cache.keys().next().value!);
  cache.set(path, pending);
  return pending;
}
export function useThumbnail(path: string | undefined, enabled: boolean) {
  const [image, setImage] = useState<{
    path: string;
    url: string | undefined;
  } | null>(null);
  useEffect(() => {
    if (!enabled || !path || !isTauri()) return;
    let cancelled = false;
    void thumbnail(path).then((url) => {
      if (!cancelled) setImage({ path, url });
    });
    return () => {
      cancelled = true;
    };
  }, [path, enabled]);
  if (!path) return undefined;
  if (!enabled || !isTauri()) return convertFileSrc(path);
  return image?.path === path ? image.url : undefined;
}
