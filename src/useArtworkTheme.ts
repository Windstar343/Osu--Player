import { useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Track } from "./model";
const pink = [242, 138, 182];
const colors = new Map<string, number[]>();
export function artworkAccent(data: Uint8ClampedArray): number[] {
  const bins = new Map<string, { sum: number[]; weight: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const rgb = [data[i], data[i + 1], data[i + 2]],
      max = Math.max(...rgb),
      min = Math.min(...rgb);
    if (data[i + 3] < 128 || max < 45 || min > 225 || max - min < 25) continue;
    const key = rgb.map((v) => v >> 5).join(","),
      weight = (max - min) / 255;
    const bin = bins.get(key) || { sum: [0, 0, 0], weight: 0 };
    rgb.forEach((v, j) => (bin.sum[j] += v * weight));
    bin.weight += weight;
    bins.set(key, bin);
  }
  const winner = [...bins.values()].sort((a, b) => b.weight - a.weight)[0];
  if (!winner) return pink;
  let rgb = winner.sum.map((v) => v / winner.weight);
  const luminance = (values: number[]) =>
    values
      .map((v) => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  while (luminance(rgb) < 0.42) rgb = rgb.map((v) => v + (255 - v) * 0.08);
  return rgb.map(Math.round);
}
export function useArtworkTheme(
  track: Track | null,
  theme: "artwork" | "pink",
) {
  useEffect(() => {
    let cancelled = false;
    const apply = (rgb: number[]) =>
      document.documentElement.style.setProperty("--accent-rgb", rgb.join(" "));
    apply(pink);
    const path = track?.backgroundPath;
    if (theme === "pink" || !path) return;
    if (colors.has(path)) {
      apply(colors.get(path)!);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 32;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 32, 32);
        const rgb = artworkAccent(ctx.getImageData(0, 0, 32, 32).data);
        if (colors.size >= 128) colors.delete(colors.keys().next().value!);
        colors.set(path, rgb);
        apply(rgb);
      } catch {
        /* Unreadable artwork keeps the fixed accent. */
      }
    };
    img.src = convertFileSrc(path);
    return () => {
      cancelled = true;
      img.onload = null;
    };
  }, [track?.backgroundPath, theme]);
}
