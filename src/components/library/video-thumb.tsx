"use client";

import { useEffect, useState } from "react";

/**
 * Reliable video thumbnail: grabs the first frame client-side (offscreen <video>
 * → canvas → still image) instead of relying on `<video preload="metadata">`,
 * which renders blank when the source isn't "fast-start" encoded. Falls back to a
 * lightweight <video> element if frame capture fails (e.g. CORS-tainted canvas).
 */
export function VideoThumb({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [poster, setPoster] = useState<string | null>(null);

  useEffect(() => {
    let done = false;
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    const capture = () => {
      if (done) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 180;
        const ctx = canvas.getContext("2d");
        if (ctx && video.videoWidth) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          setPoster(canvas.toDataURL("image/jpeg", 0.7));
          done = true;
        }
      } catch {
        done = true; // tainted canvas (CORS) — keep the <video> fallback
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
  }, [src]);

  if (poster) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={poster} alt={alt} className={className} />;
  }
  return (
    <video src={`${src}#t=0.1`} muted playsInline preload="metadata" className={className} />
  );
}
