"use client";

import { useEffect, useRef, useState } from "react";
import { savePoster } from "@/app/actions/creatives";

/**
 * Video thumbnail without downloading the video.
 *
 * Grabbing frame 0 client-side used to cost a full file download per card (29
 * videos × tens of MB, all at once, re-fetched on every visit because signed
 * URLs rotate). Three fixes:
 *   1. `preload="metadata"` + a seek — the browser range-requests the header and
 *      the frame, not the whole file.
 *   2. IntersectionObserver — only cards actually on screen do any work.
 *   3. The captured frame is cached in localStorage under the STORAGE PATH, so
 *      it survives signed-URL rotation and later visits are instant/offline.
 */
const CACHE_PREFIX = "wf-thumb:";
const CACHE_MAX = 80; // entries; ~20KB each keeps us well inside the 5MB quota
const THUMB_W = 320;

function cacheGet(key: string): string | null {
  try {
    return localStorage.getItem(CACHE_PREFIX + key);
  } catch {
    return null;
  }
}

function cacheSet(key: string, dataUrl: string) {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX));
    // Simple FIFO eviction — thumbnails are cheap to regenerate.
    if (keys.length >= CACHE_MAX) {
      for (const k of keys.slice(0, keys.length - CACHE_MAX + 10)) localStorage.removeItem(k);
    }
    localStorage.setItem(CACHE_PREFIX + key, dataUrl);
  } catch {
    // Quota exceeded or storage disabled — the thumbnail still shows this session.
  }
}

export function VideoThumb({
  src,
  alt,
  className,
  cacheKey,
  storagePath,
}: {
  src: string;
  alt: string;
  className?: string;
  /** Stable identity for caching (storage path) — signed URLs change every load. */
  cacheKey?: string;
  /** When set, the captured frame is stored server-side so other viewers (and
   *  other devices) never fetch the video at all. Needs `upload` permission;
   *  failures are ignored — the local cache still works. */
  storagePath?: string | null;
}) {
  const key = cacheKey ?? src;
  const [poster, setPoster] = useState<string | null>(() =>
    typeof window === "undefined" ? null : cacheGet(key),
  );
  const [visible, setVisible] = useState(false);
  const holder = useRef<HTMLDivElement>(null);

  // Only work once the card is near the viewport.
  useEffect(() => {
    if (poster || !holder.current) return;
    const el = holder.current;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" }, // start just before it scrolls in
    );
    io.observe(el);
    return () => io.disconnect();
  }, [poster]);

  useEffect(() => {
    if (poster || !visible) return;
    let done = false;
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata"; // header + the seeked frame only — not the file

    const capture = () => {
      if (done) return;
      done = true;
      try {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (vw) {
          const scale = Math.min(1, THUMB_W / vw);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(vw * scale);
          canvas.height = Math.round(vh * scale);
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
            setPoster(dataUrl);
            cacheSet(key, dataUrl);
            // Heal it for everyone else — silent, best-effort, once per file.
            if (storagePath) void savePoster(storagePath, dataUrl).catch(() => {});
          }
        }
      } catch {
        // Tainted canvas (CORS) — the <video> fallback below still renders.
      }
      video.removeAttribute("src");
      video.load();
    };

    const onLoaded = () => {
      try {
        video.currentTime = 0.1;
      } catch {
        capture();
      }
    };

    video.addEventListener("loadeddata", onLoaded, { once: true });
    video.addEventListener("seeked", capture, { once: true });
    video.addEventListener("error", () => (done = true), { once: true });
    video.src = src;

    return () => {
      done = true;
      video.removeAttribute("src");
    };
  }, [src, key, poster, visible]);

  if (poster) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={poster} alt={alt} className={className} />;
  }
  // Placeholder until it's on screen; then a lightweight metadata-only preview.
  return (
    <div ref={holder} className={className}>
      {visible ? (
        <video src={`${src}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
      ) : null}
    </div>
  );
}
