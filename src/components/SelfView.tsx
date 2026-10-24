import { cn } from "@/lib/utils";
import { CameraOff, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Your side of the video call: the device camera, mirrored like every other
 * video call you have ever been on.
 *
 * Nothing is sent anywhere — the stream stays on this device and is released
 * the moment the camera is turned off or the call ends. If the browser has no
 * camera, or permission is refused, the tile says so instead of showing a
 * broken black box; the call carries on with her voice either way.
 */
export function SelfView({
  enabled,
  className,
}: {
  enabled: boolean;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  /**
   * The camera's own state, written only from the camera's callbacks.
   *
   * "Off" is not stored: it is what the tiles show whenever the caller's
   * switch says so. Writing state straight in the effect body would cascade a
   * render on every toggle, so the restarts show through the derived phase
   * below instead.
   */
  const [streamState, setStreamState] = useState<"starting" | "live" | "blocked">(
    "starting",
  );

  useEffect(() => {
    // A switched-off tile never asks for the camera at all.
    if (!enabled) return;

    let stream: MediaStream | null = null;
    let cancelled = false;

    const media = navigator.mediaDevices;
    if (!media?.getUserMedia) {
      queueMicrotask(() => {
        if (!cancelled) setStreamState("blocked");
      });
      return;
    }

    media
      .getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 } },
        audio: false,
      })
      .then((next) => {
        if (cancelled) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = next;
        const element = videoRef.current;
        if (element) {
          element.srcObject = next;
          void element.play().catch(() => undefined);
        }
        setStreamState("live");
      })
      .catch(() => {
        if (!cancelled) setStreamState("blocked");
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [enabled]);

  const state: "off" | "starting" | "live" | "blocked" = !enabled
    ? "off"
    : streamState;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-border/50 bg-black",
        className,
      )}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        className={cn(
          "size-full -scale-x-100 object-cover transition-opacity duration-500",
          state === "live" ? "opacity-100" : "opacity-0",
        )}
      />

      {state !== "live" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center">
          {state === "starting" ? (
            <>
              <Loader2 className="size-4 animate-spin text-white/60" />
              <p className="text-[11px] text-white/60">starting camera…</p>
            </>
          ) : (
            <>
              <CameraOff className="size-4 text-white/50" />
              <p className="max-w-[20ch] text-[11px] leading-snug text-white/55">
                {state === "blocked"
                  ? "Camera blocked — the call still works"
                  : "Your camera is off"}
              </p>
            </>
          )}
        </div>
      )}

      <span className="absolute bottom-2 left-2 rounded-full bg-black/45 px-2 py-0.5 text-[10px] tracking-wide text-white/80 backdrop-blur-sm">
        you
      </span>
    </div>
  );
}
