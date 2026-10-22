import { FeliciaVideoFeed } from "@/components/FeliciaVideoFeed";
import { SelfView } from "@/components/SelfView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useFeliciaAvatar } from "@/hooks/use-felicia-avatar";
import {
  defaultFace,
  hasFace,
  readCameraPicture,
  readFace,
  saveCameraPicture,
  saveFace,
  type Face,
} from "@/lib/feliciaCamera";
import { FELICIA } from "@/lib/felicia";
import { FELICIA_GALLERY } from "@/lib/gallery";
import { cn } from "@/lib/utils";
import { DEVELOP_MS, preloadImage } from "@/lib/photo";
import {
  hasSpeechRecognition,
  listenOnce,
  playAudioUrl,
  primeVoices,
  sleep,
  speakWithBrowser,
  stopBrowserSpeech,
} from "@/lib/voice";
import { useAction } from "convex/react";
import { motion } from "framer-motion";
import {
  Check,
  Images,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Send,
  Video,
  VideoOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type CallStatus =
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "idle";

const STATUS_LABEL: Record<CallStatus, string> = {
  connecting: "connecting…",
  listening: "listening",
  thinking: "thinking…",
  speaking: "speaking",
  idle: "muted — type below, or unmute",
};

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * A voice call with Felicia.
 *
 * Her lines are rendered by Venice's text-to-speech and streamed back as audio —
 * the same key as her chat. The device voice is the last resort, so a call
 * always has something to say even when Venice can't be reached.
 *
 * Your side is transcribed on device by the browser.
 */
export interface CallGreeting {
  messageId: Id<"messages">;
  reply: string;
}

export function FeliciaCall({
  greeting,
  initialNote,
  onClose,
  video = false,
}: {
  /**
   * Felicia's opening line, fetched by the caller on click.
   *
   * It is deliberately not fetched in an effect: StrictMode runs effects twice,
   * which would ask her to pick up twice and leave two greetings in the chat.
   * Click handlers are only invoked once.
   */
  greeting: CallGreeting | null;
  /** Explains why there's no greeting, e.g. the neuron budget is spent. */
  initialNote?: string | null;
  onClose: () => void;
  /**
   * Camera call instead of a voice call.
   *
   * Her side is her picture, brought to life (breathing, drifting, lips moving
   * while she speaks); your side is this device's camera. The conversation is
   * exactly the same one either way.
   */
  video?: boolean;
}) {
  const sendMessage = useAction(api.felicia.sendMessage);
  const generatePhoto = useAction(api.felicia.generatePhoto);
  const speakMessage = useAction(api.felicia.speakMessage);
  const avatarUrl = useFeliciaAvatar();

  const [status, setStatus] = useState<CallStatus>("connecting");
  const [interim, setInterim] = useState("");
  const [lastLine, setLastLine] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  /** True only while her voice is actually audible — drives the lips. */
  const [talking, setTalking] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [typed, setTyped] = useState("");
  const [micSupported] = useState(() => hasSpeechRecognition());

  // Her camera: which picture she is on, and where her face sits on it.
  const [feedId, setFeedId] = useState(
    () => readCameraPicture() ?? FELICIA_GALLERY[0].id,
  );
  const [face, setFace] = useState<Face>(() => readFace(feedId));
  const [cameraOn, setCameraOn] = useState(true);
  const [pictureOpen, setPictureOpen] = useState(false);
  const [stage, setStage] = useState<"pick" | "align">("pick");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingFace, setPendingFace] = useState<Face>(defaultFace());
  /** Which point of her face the next tap on the picture places. */
  const [activePoint, setActivePoint] = useState<"mouth" | "eyes">("mouth");

  /**
   * Monotonic run id.
   *
   * StrictMode mounts effects twice. A plain boolean cannot tell the first run
   * that it is stale, because the second mount resets it — which would leave two
   * conversation loops alive, greeting twice and sending every utterance twice.
   */
  const runIdRef = useRef(0);
  const mutedRef = useRef(false);
  const busyRef = useRef(false);
  const abortRef = useRef<(() => void) | null>(null);
  const usedFallbackRef = useRef(false);
  /** Refs survive a StrictMode effect teardown, so this survives the remount. */
  const spokenGreetingRef = useRef<Id<"messages"> | null>(null);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    const id = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, []);

  /**
   * The first video call opens on "tap her face".
   *
   * Her mouth and eyes are the two things that have to be placed by hand — a
   * moving mouth looks like talking only when it is on her lips, and blinking
   * only works on her eyes — so it is done once, on the way in, instead of
   * discovering a shadow on her chin mid-sentence.
   */
  const faceAskedRef = useRef(false);
  useEffect(() => {
    if (!video || faceAskedRef.current || hasFace(feedId)) return;
    faceAskedRef.current = true;
    setPendingId(feedId);
    setPendingFace(face);
    setActivePoint("mouth");
    setStage("align");
    setPictureOpen(true);
  }, [video, feedId, face]);

  /** Speak one of her lines in her own voice, falling back to the device voice. */
  const say = useCallback(
    async (
      messageId: Id<"messages">,
      text: string,
      active: () => boolean,
    ) => {
      setStatus("speaking");
      setLastLine(text);

      // Venice renders her line — her real voice, the same key as her chat. The
      // mouth starts when the sound does, not while it is still being rendered.
      const startTalking = () => setTalking(true);
      let played = false;
      try {
        const { url } = await speakMessage({ messageId });
        if (url) played = await playAudioUrl(url, startTalking);
      } catch {
        played = false;
      }

      if (!active()) {
        setTalking(false);
        return;
      }

      if (!played) {
        if (!usedFallbackRef.current) {
          usedFallbackRef.current = true;
          setNote(
            "Her own voice isn't available right now, so she's using your device voice.",
          );
        }
        setTalking(true);
        await speakWithBrowser(text);
      }
      setTalking(false);
    },
    [speakMessage],
  );

  /** Generate a photo mid-call, honouring the same reveal delay as the chat. */
  const showPhoto = useCallback(
    async (scene: string, active: () => boolean) => {
      const startedAt = Date.now();
      try {
        const result = await generatePhoto({ scene });
        const remaining = DEVELOP_MS - (Date.now() - startedAt);
        if (remaining > 0) await sleep(remaining);
        if (result.url) {
          await preloadImage(result.url);
          if (active()) setPhotoUrl(result.url);
        }
      } catch {
        // A failed photo should never drop the call.
      }
    },
    [generatePhoto],
  );

  /**
   * Show a picture she already had in her roll. There is no developing time to
   * honour: it only has to be decoded before it appears.
   */
  const showExisting = useCallback(
    async (url: string, active: () => boolean) => {
      await preloadImage(url);
      if (active()) setPhotoUrl(url);
    },
    [],
  );

  useEffect(() => {
    if (!greeting) {
      // She never picked up — show why, and let the call screen stay usable.
      return;
    }
    // Keep initialNote in scope for the render surface contract without
    // triggering a lint-unnecessary-unused-var error.
    void initialNote;

    // Captured as a const so the nested closure keeps the non-null narrowing.
    const opening = greeting;
    const runId = (runIdRef.current += 1);
    const active = () => runIdRef.current === runId;
    usedFallbackRef.current = false;
    primeVoices();

    async function run() {
      if (!active()) return;

      setStatus("connecting");

      // Guarded so a StrictMode remount does not replay her opening line.
      if (spokenGreetingRef.current !== opening.messageId) {
        spokenGreetingRef.current = opening.messageId;
        await say(opening.messageId, opening.reply, active);
      }
      if (!active()) return;

      if (!micSupported) {
        setNote(
          "This browser can't listen, so type to her below — she'll still speak back.",
        );
        setStatus("idle");
        return;
      }

      let misses = 0;

      while (active()) {
        // Stay quiet while muted, or while a typed message is in flight, so the
        // voice loop and typing can't both send at once.
        if (mutedRef.current || busyRef.current) {
          if (!busyRef.current) setStatus("idle");
          await sleep(250);
          continue;
        }

        setStatus("listening");
        const handle = listenOnce(setInterim);
        abortRef.current = handle.abort;
        const heard = await handle.promise;
        abortRef.current = null;

        if (!active()) return;
        setInterim("");

        if (heard.fatal) {
          setNote(heard.fatal);
          setStatus("idle");
          return;
        }

        if (!heard.text) {
          misses += 1;
          if (misses > 4) {
            setNote("I couldn't hear anything. Unmute the mic, or type below.");
            setStatus("idle");
            return;
          }
          await sleep(400);
          continue;
        }

        misses = 0;
        setStatus("thinking");
        try {
          const result = await sendMessage({ text: heard.text });
          if (!active()) return;
          if (result.photoUrl) void showExisting(result.photoUrl, active);
          else if (result.photoScene) void showPhoto(result.photoScene, active);
          await say(result.replyMessageId, result.reply, active);
        } catch (error) {
          if (!active()) return;
          setNote(error instanceof Error ? error.message : "That didn't send.");
          setStatus("idle");
          return;
        }
      }
    }

    void run();

    return () => {
      // Invalidate this run, so a StrictMode remount cannot leave it running.
      runIdRef.current += 1;
      abortRef.current?.();
      abortRef.current = null;
      stopBrowserSpeech();
    };
  }, [greeting, initialNote, sendMessage, say, showPhoto, showExisting, micSupported]);

  /** Typing is only available when the voice loop is idle (e.g. muted). */
  async function handleTyped(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = typed.trim();
    if (!text || status !== "idle" || busyRef.current) return;

    const runId = runIdRef.current;
    const active = () => runIdRef.current === runId;

    busyRef.current = true;
    setTyped("");
    setStatus("thinking");
    try {
      const result = await sendMessage({ text });
      if (!active()) return;
      if (result.photoUrl) void showExisting(result.photoUrl, active);
      else if (result.photoScene) void showPhoto(result.photoScene, active);
      await say(result.replyMessageId, result.reply, active);
    } catch (error) {
      if (!active()) return;
      toast.error(error instanceof Error ? error.message : "That didn't send.");
      setStatus("idle");
    } finally {
      busyRef.current = false;
    }
  }

  function handleHangUp() {
    runIdRef.current += 1;
    abortRef.current?.();
    abortRef.current = null;
    stopBrowserSpeech();
    onClose();
  }

  const canType = status === "idle";

  /** The picture she is on, and the one being chosen in the picker. */
  const feedPhoto =
    FELICIA_GALLERY.find((photo) => photo.id === feedId) ?? FELICIA_GALLERY[0];
  const pendingPhoto = pendingId
    ? (FELICIA_GALLERY.find((photo) => photo.id === pendingId) ?? null)
    : null;

  function openPictures() {
    setPendingId(null);
    setStage("pick");
    setPictureOpen(true);
  }

  function choosePicture(id: string) {
    setPendingId(id);
    setPendingFace(readFace(id));
    setActivePoint("mouth");
    setStage("align");
  }

  /**
   * Where the tapped feature is on the picture.
   *
   * The preview is the same 3:4 crop as her camera feed, so the percentage of
   * the box that was tapped is the percentage of the picture — no conversion
   * to do, and the mouth and eyes land where they were put at any screen size.
   */
  function tapPoint(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const point = {
      x: Math.min(
        100,
        Math.max(0, ((event.clientX - rect.left) / rect.width) * 100),
      ),
      y: Math.min(
        100,
        Math.max(0, ((event.clientY - rect.top) / rect.height) * 100),
      ),
    };
    setPendingFace((current) => ({ ...current, [activePoint]: point }));
  }

  function usePicture() {
    if (!pendingId) return;
    saveCameraPicture(pendingId);
    saveFace(pendingId, pendingFace);
    setFeedId(pendingId);
    setFace(pendingFace);
    setStage("pick");
    setPendingId(null);
    setPictureOpen(false);
  }

  if (video) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        {/* Her camera — everything above your own face. */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <FeliciaVideoFeed
            url={feedPhoto.fullUrl}
            speaking={talking}
            face={face}
            className="absolute inset-0 bg-black"
          />

          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
            <Badge
              variant="outline"
              className="gap-2 rounded-full border-white/25 bg-black/35 px-3 py-1 text-white backdrop-blur-md"
            >
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/70" />
                <span className="relative inline-flex size-1.5 rounded-full bg-white" />
              </span>
              live
            </Badge>
            <span className="rounded-full border border-white/20 bg-black/35 px-3 py-1 font-mono text-xs text-white/90 backdrop-blur-md">
              {formatDuration(elapsed)}
            </span>
          </div>

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-4 pt-16 pb-4 text-white">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-xl tracking-tight">
                {FELICIA.fullName}
              </h2>
              <button
                type="button"
                onClick={openPictures}
                className="flex items-center gap-1.5 rounded-full border border-white/25 bg-black/35 px-2.5 py-1 text-[11px] text-white/85 backdrop-blur-md transition-colors hover:bg-black/55"
              >
                <Images className="size-3.5" />
                picture
              </button>
            </div>
            <p className="text-[11px] text-white/65">{STATUS_LABEL[status]}</p>
            {(interim || lastLine) && (
              <p className="mt-1 line-clamp-2 text-sm leading-snug text-white/90">
                {interim ? `“${interim}”` : lastLine}
              </p>
            )}
          </div>
        </div>

        {/* Your face, below hers. */}
        <div className="shrink-0 px-3 pt-2 pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto w-full max-w-md">
            <SelfView
              enabled={cameraOn}
              className="h-[20vh] w-full sm:h-[22vh]"
            />

            {note && (
              <p className="mt-2 rounded-2xl border border-border/60 bg-card/80 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                {note}
              </p>
            )}

            <form onSubmit={handleTyped} className="mt-2 flex items-center gap-2">
              <Input
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={canType ? "Type to her…" : "Listening…"}
                disabled={!canType}
                className="surface h-8 rounded-full border-0 bg-card/70 shadow-none backdrop-blur-md focus-visible:ring-2 focus-visible:ring-ring/50"
              />
              <Button
                type="submit"
                size="icon"
                className="lift-primary size-9 shrink-0 rounded-full transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
                disabled={!canType || !typed.trim()}
              >
                {status === "thinking" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </Button>
            </form>

            <div className="mt-2 flex items-center justify-center gap-2.5 pb-3">
              <Button
                type="button"
                variant={cameraOn ? "outline" : "secondary"}
                size="icon"
                className="surface size-11 rounded-full border-border/60 bg-card/70 backdrop-blur-md hover:bg-card"
                onClick={() => setCameraOn((value) => !value)}
                aria-label={cameraOn ? "Turn your camera off" : "Turn your camera on"}
                title={cameraOn ? "Camera off" : "Camera on"}
              >
                {cameraOn ? (
                  <Video className="size-4" />
                ) : (
                  <VideoOff className="size-4" />
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="icon"
                className="surface size-11 rounded-full border-border/60 bg-card/70 backdrop-blur-md hover:bg-card"
                onClick={openPictures}
                aria-label="Change her picture"
                title="Change her picture"
              >
                <Images className="size-4" />
              </Button>

              <Button
                type="button"
                variant={muted ? "secondary" : "outline"}
                size="icon"
                className="surface size-11 rounded-full border-border/60 bg-card/70 backdrop-blur-md hover:bg-card"
                onClick={() => setMuted((value) => !value)}
                disabled={!micSupported}
                aria-label={muted ? "Unmute" : "Mute"}
                title={muted ? "Unmute" : "Mute"}
              >
                {muted ? (
                  <MicOff className="size-4" />
                ) : (
                  <Mic className="size-4" />
                )}
              </Button>

              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="size-11 rounded-full shadow-[0_14px_30px_-14px_oklch(0.55_0.2_300/90%)] transition-transform hover:scale-105"
                onClick={handleHangUp}
                aria-label="End call"
                title="End call"
              >
                <PhoneOff className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        <Dialog
          open={pictureOpen}
          onOpenChange={(open) => {
            setPictureOpen(open);
            if (!open) {
              setStage("pick");
              setPendingId(null);
            }
          }}
        >
          <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto border-border/60 bg-card">
            <DialogHeader>
              <DialogTitle className="font-display text-xl">
                Her camera
              </DialogTitle>
              <DialogDescription>
                {stage === "pick"
                  ? "Pick the picture she appears in on the call."
                  : activePoint === "mouth"
                    ? "Tap her lips, so they move while she talks."
                    : "Now tap between her eyes, so she can blink."}
              </DialogDescription>
            </DialogHeader>

            {stage === "pick" ? (
              <div className="grid max-h-[58vh] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
                {FELICIA_GALLERY.map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => choosePicture(photo.id)}
                    className={cn(
                      "relative overflow-hidden rounded-xl border transition-transform hover:scale-[1.02]",
                      photo.id === feedId
                        ? "border-primary ring-2 ring-primary/50"
                        : "border-border/50",
                    )}
                    title={photo.title}
                  >
                    <img
                      src={photo.url}
                      alt={photo.title}
                      loading="lazy"
                      className="aspect-[3/4] w-full object-cover"
                    />
                    {photo.id === feedId && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Check className="size-5 text-white" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div>
                <div className="mb-2 flex items-center gap-1.5">
                  {(
                    [
                      ["mouth", "Her lips"],
                      ["eyes", "Her eyes"],
                    ] as const
                  ).map(([point, label]) => (
                    <button
                      key={point}
                      type="button"
                      onClick={() => setActivePoint(point)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                        activePoint === point
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border/60 text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                  <span className="ml-auto text-[10px] text-muted-foreground/70">
                    tap the picture
                  </span>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  onClick={tapPoint}
                  className="relative cursor-crosshair overflow-hidden rounded-2xl"
                >
                  {pendingPhoto && (
                    <img
                      src={pendingPhoto.url}
                      alt={pendingPhoto.title}
                      className="aspect-[3/4] w-full object-cover"
                    />
                  )}
                  {(["mouth", "eyes"] as const).map((point) => {
                    const placed = pendingFace[point];
                    const active = activePoint === point;
                    return (
                      <motion.span
                        key={point}
                        className={cn(
                          "pointer-events-none absolute flex size-5 items-center justify-center rounded-full border-2 shadow-lg",
                          active
                            ? "border-white bg-primary/80"
                            : "border-white/70 bg-black/45",
                        )}
                        style={{
                          left: `${placed.x}%`,
                          top: `${placed.y}%`,
                          x: "-50%",
                          y: "-50%",
                        }}
                        animate={active ? { scale: [1, 1.18, 1] } : { scale: 1 }}
                        transition={
                          active
                            ? { duration: 1.6, repeat: Infinity }
                            : { duration: 0.2 }
                        }
                      />
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setStage("pick");
                      setPendingId(null);
                    }}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5 rounded-full"
                    onClick={usePicture}
                  >
                    <Check className="size-3.5" />
                    Use this picture
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div aria-hidden className="absolute inset-0 overflow-hidden">
        <img
          src={avatarUrl}
          alt=""
          className="size-full scale-110 object-cover opacity-25 blur-2xl"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/85 to-background" />
        <div className="glow-warm absolute inset-0 opacity-90" />
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-between px-6 py-5"
        >
          <header className="flex w-full max-w-md items-center justify-between"
            // ----------------------------------------------------------------
            // Header: call indicator, timer; still comfortably above the composer.
            // ----------------------------------------------------------------
          >
            <Badge
              variant="outline"
              className="gap-2 rounded-full border-primary/40 bg-primary/10 px-3 py-1 text-primary"
              // ----------------------------------------------------------------
              // Badge: keeps the live call indicator compact so the whole bar tracks
              // the smaller composer while still reading as "on a call".
              // ----------------------------------------------------------------
            >
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
            </span>
            On a call
          </Badge>
          <span className="rounded-full border border-border/60 bg-card/60 px-3 py-1 font-mono text-sm text-muted-foreground backdrop-blur-md">
            {formatDuration(elapsed)}
          </span>
        </header>

        <div className="flex flex-col items-center"
          >
            <motion.div
              animate={status === "speaking" ? { scale: [1, 1.025, 1] } : { scale: 1 }}
              transition={
                status === "speaking"
                  ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
                  : { duration: 0.3 }
              }
              className="relative"
            >
              <div className="absolute -inset-4 rounded-full bg-primary/15 blur-2xl" />
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt="Felicia"
                  className="relative h-52 w-44 rounded-3xl border border-border/60 object-cover shadow-2xl"
                />
              ) : (
                <span className="aura relative block rounded-full bg-gradient-to-br from-primary/80 via-primary/40 to-accent/70 p-[2px] shadow-2xl">
                  <img
                    src={avatarUrl}
                    alt="Felicia"
                    className="size-36 rounded-full border border-background/40 object-cover"
                  />
                </span>
              )}
            </motion.div>

            <h2 className="mt-4 font-display text-3xl tracking-tight text-glow">
              {FELICIA.fullName}
            </h2>
            <p className="mt-1 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur-md">
              {STATUS_LABEL[status]}
            </p>

            {interim && (
              <p className="mt-2 max-w-sm text-center text-sm text-foreground/60 italic">
                &ldquo;{interim}&rdquo;
              </p>
            )}

            {lastLine && (
              <p className="mt-3 max-w-md text-center text-base leading-relaxed">
                {lastLine}
              </p>
            )}
          </div>

          <div className="w-full max-w-md">
          {note && (
            <p className="mb-2 rounded-2xl border border-border/60 bg-card/80 px-3 py-2 text-xs leading-relaxed text-muted-foreground backdrop-blur-md"
            >
              {note}
            </p>
          )}

          <form onSubmit={handleTyped} className="flex h-9 items-center gap-2"
            >
              <Input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={canType ? "Type to her…" : "Listening…"}
              disabled={!canType}
              className="surface h-8 rounded-full border-0 bg-card/70 shadow-none backdrop-blur-md focus-visible:ring-2 focus-visible:ring-ring/50"
              // ----------------------------------------------------------------
              // Input: slightly shorter so the whole bar tracks the smaller composer.
              // ----------------------------------------------------------------
            />
            <Button
              type="submit"
              size="icon"
              className="lift-primary size-9 shrink-0 rounded-full transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
              // ----------------------------------------------------------------
              // Submit: keeps a touch-friendly target while staying compact.
              // ----------------------------------------------------------------
              disabled={!canType || !typed.trim()}
            >
              {status === "thinking" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </form>

          <div className="mt-4 flex items-center justify-center gap-3"
            >
              <Button
                type="button"
                variant={muted ? "secondary" : "outline"}
                size="icon"
                className="surface size-11 rounded-full border-border/60 bg-card/70 backdrop-blur-md hover:bg-card"
                onClick={() => setMuted((value) => !value)}
                disabled={!micSupported}
                aria-label={muted ? "Unmute" : "Mute"}
                title={muted ? "Unmute" : "Mute"}
              >
                {muted ? (
                  <MicOff className="size-4" />
                ) : (
                  <Mic className="size-4" />
                )}
              </Button>

              <Button
                type="button"
                variant="destructive"
                size="lg"
                className="gap-2 rounded-full px-7 shadow-[0_14px_30px_-14px_oklch(0.55_0.2_300/90%)] transition-transform hover:scale-105"
                onClick={handleHangUp}
              >
                <PhoneOff className="size-4" />
                End call
              </Button>
            </div>
        </div>
      </div>
    </div>
  );
}
