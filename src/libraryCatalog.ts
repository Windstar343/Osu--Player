import { Track } from "./model";
export function reconcileLibrary(fresh: Track[], known: Track[]) {
  const catalog = new Map(known.map((t) => [t.id, t]));
  for (const track of fresh)
    catalog.set(track.id, { ...track, missing: false });
  const available = new Set(fresh.map((t) => t.id));
  return {
    catalog: [...catalog.values()],
    unavailable: [...catalog.values()]
      .filter((t) => !available.has(t.id))
      .map((t) => ({ ...t, missing: true })),
  };
}
