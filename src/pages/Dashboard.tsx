import { FeliciaCall, type CallGreeting } from "@/components/FeliciaCall";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { FELICIA } from "@/lib/felicia";
import { DEVELOP_MS, preloadImage } from "@/lib/photo";
import { cn } from "@/lib/utils";
import { beginVoiceNote, playAudioUrl, speakWithBrowser } from "@/lib/voice";
import { useAction, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Camera,
  Ellipsis,
  Images,
  Info,
  Loader2,
  Mic,
  Palette,
  Paperclip,
  Phone,
  Send,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

/**
 * Whether her replies are read aloud automatically.
 *
 * Kept in localStorage because it is a preference, not session state — someone
 * who turns her voice off in a quiet office should not have to turn it off
 * again on every visit.
 */
const AUTO_VOICE_KEY = "felicia:auto-voice";

function readAutoVoicePref(): boolean {
  try {
    const stored = window.localStorage.getItem(AUTO_VOICE_KEY);
    return stored === null ? true : stored === "1";
  } catch {
    // Private mode or storage disabled — default to on rather than crashing.
    return true;
  }
}

const OPENERS = [
  "What are you doing right now?",
  "Send me a photo of where you are",
  "Bad day. Tell me something good.",
  "What's playing in the studio?",
];

function timeLabel(ms: number) {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** One entry in the conversation, whether it is text, a shared photo or hers. */
type TimelineItem = {
  id: string;
  kind: "message" | "photo";
  role: "user" | "felicia";
  createdAt: number;
  content: string;
  imageUrl: string | null;
  scene?: string;
  messageId?: Id<"messages">;
};

export default function Dashboard() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const messages = useQuery(api.felicia.messages);
  const photos = useQuery(api.felicia.photos);
  const connection = useQuery(api.felicia.connectorStatus);
  const clearConversation = useMutation(api.felicia.clearConversation);
  const sendMessage = useAction(api.felicia.sendMessage);
  const generatePhoto = useAction(api.felicia.generatePhoto);
  const sendUserPhoto = useAction(api.felicia.sendUserPhoto);
  const speakMessage = useAction(api.felicia.speakMessage);
  const startCall = useAction(api.felicia.startCall);

  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [developing, setDeveloping] = useState(false);
  const [hiddenCount, setHiddenCount] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [callOpen, setCallOpen] = useState(false);
  const [greeting, setGreeting] = useState<CallGreeting | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const [artOpen, setArtOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [autoVoice, setAutoVoice] = useState(readAutoVoicePref);

  // Mirrors `autoVoice` for the same reason as `speakingRef`: a send that is
  // already in flight reads the value from the render it started in, so it
  // would otherwise autoplay (or stay silent) based on a stale preference.
  const autoVoiceRef = useRef(autoVoice);
  // `speakingId` as a ref too, because playMessage is called from async
  // handlers that finished after a later render.
  const speakingRef = useRef<Id<"messages"> | null>(null);

  useEffect(() => {
    autoVoiceRef.current = autoVoice;
  }, [autoVoice]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const voiceRef = useRef<{
    end: () => Promise<string | null>;
    cancel: () => void;
  } | null>(null);

  const list = messages ?? [];
  const lastUserMessage = [...list].reverse().find((m) => m.role === "user");
  const showPending = pending !== null && lastUserMessage?.content !== pending;
  // A photo can still be developing while you carry on typing — a companion app
  // shouldn't lock the composer for six seconds. Only an in-flight reply or a
  // live recording actually blocks it.
  const composing = thinking || recording;

  const allPhotos = photos ?? [];
  // Photo requests are blocked until the gallery has loaded, because the reveal
  // gate works by counting photos. Capturing a baseline while the list is still
  // loading would read as zero and hide every photo instead of just the new one.
  const photosReady = photos !== undefined;

  // Her photos are newest-first, so anything above the baseline captured when a
  // request started is a photo still developing and must stay off screen.
  const hiddenPhotoIds = new Set<string>();
  if (hiddenCount !== null) {
    const fresh = allPhotos.slice(
      0,
      Math.max(0, allPhotos.length - hiddenCount),
    );
    for (const photo of fresh) hiddenPhotoIds.add(String(photo._id));
  }

  const items: TimelineItem[] = [
    ...list.map((message) => ({
      id: `m${message._id}`,
      kind: "message" as const,
      role: message.role,
      createdAt: message.createdAt,
      content: message.content,
      imageUrl: message.imageUrl,
      messageId: message._id,
    })),
    ...allPhotos
      .filter((photo) => !hiddenPhotoIds.has(String(photo._id)))
      .map((photo) => ({
        id: `p${photo._id}`,
        kind: "photo" as const,
        role: "felicia" as const,
        createdAt: photo.createdAt,
        content: "",
        imageUrl: photo.url,
        scene: photo.scene,
      })),
  ].sort((a, b) => a.createdAt - b.createdAt);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [items.length, showPending, developing, interim]);

  /**
   * Ask Felicia for a photo, then reveal it only once it is genuinely finished:
   * generated on the server, decoded by the browser, and DEVELOP_MS old.
   */
  async function requestPhoto(scene: string) {
    if (!photosReady) return;

    setHiddenCount(allPhotos.length);
    setDeveloping(true);
    try {
      const result = await generatePhoto({ scene });
      // The Horde action already waited for the image to exist, so the only
      // remaining gate is browser decode. Preload it once; if it has already
      // loaded, the promise resolves immediately.
      if (result.url) await preloadImage(result.url);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Felicia couldn't send that photo.",
      );
    } finally {
      setDeveloping(false);
      setHiddenCount(null);
    }
  }

  /**
   * Open the call and ask her to pick up.
   *
   * The greeting is fetched here rather than inside the call's effect, because
   * StrictMode runs effects twice — that would ring her twice and leave two
   * greetings in the transcript. Click handlers only run once.
   */
  async function handleStartCall() {
    setGreeting(null);
    setCallError(null);
    setCallOpen(true);
    try {
      setGreeting(await startCall({}));
    } catch (error) {
      setCallError(
        error instanceof Error
          ? error.message
          : "Felicia didn't pick up. Try again in a moment.",
      );
    }
  }

  /**
   * Play one of her lines aloud, using her own voice when it is available.
   *
   * Used both by the per-message play button and by auto-play, so the guard
   * reads the ref rather than the state: an auto-play fires from an async
   * handler that closed over an older render. Returns quietly when a line is
   * already playing, which is what stops two autoplays from overlapping.
   */
  async function playMessage(messageId: Id<"messages">, content: string) {
    if (speakingRef.current) return;
    speakingRef.current = messageId;
    setSpeakingId(messageId);
    try {
      const { url } = await speakMessage({ messageId });
      // A browser that blocks the play resolves false, so she falls back to the
      // device voice instead of sitting in silence.
      let played = false;
      if (url) played = await playAudioUrl(url);
      if (!played) await speakWithBrowser(content);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Felicia couldn't speak just now.",
      );
    } finally {
      speakingRef.current = null;
      setSpeakingId(null);
    }
  }

  /** Flip auto-play and remember the choice. */
  function toggleAutoVoice() {
    setAutoVoice((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(AUTO_VOICE_KEY, next ? "1" : "0");
      } catch {
        // Storage unavailable; the preference just won't survive a reload.
      }
      return next;
    });
  }

  async function handleSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed || composing) return;

    setDraft("");
    setPending(trimmed);
    setThinking(true);

    try {
      const result = await sendMessage({ text: trimmed });
      setPending(null);
      setThinking(false);
      if (autoVoiceRef.current) {
        // Deliberately not awaited: she starts talking while a photo, if she
        // sent one, is still developing.
        void playMessage(result.replyMessageId, result.reply);
      }
      if (result.photoScene) {
        void requestPhoto(result.photoScene);
      }
    } catch (error) {
      setPending(null);
      setThinking(false);
      toast.error(
        error instanceof Error ? error.message : "Felicia didn't get that.",
      );
    }
  }

  /** Attach a photo from the composer and let her react to it. */
  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || composing) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Send an image file.");
      return;
    }
    if (file.size > 6_000_000) {
      toast.error("That photo is over 6 MB — try a smaller one.");
      return;
    }

    setThinking(true);
    try {
      const data = await file.arrayBuffer();
      const result = await sendUserPhoto({ data, mimeType: file.type });
      if (autoVoiceRef.current) {
        void playMessage(result.replyMessageId, result.reply);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "That photo didn't send.",
      );
    } finally {
      setThinking(false);
    }
  }

  // ----------------------------------------------------------- voice message

  function startRecording() {
    if (voiceRef.current || thinking) return;
    const note = beginVoiceNote(setInterim);
    if (!note.supported) {
      toast.error("This browser can't record voice messages. Type instead.");
      return;
    }
    voiceRef.current = note;
    setInterim("");
    setRecording(true);
  }

  async function stopRecording() {
    const note = voiceRef.current;
    if (!note) return;
    voiceRef.current = null;
    setRecording(false);
    const text = await note.end();
    setInterim("");
    if (text) void handleSend(text);
  }

  function cancelRecording() {
    const note = voiceRef.current;
    if (!note) return;
    voiceRef.current = null;
    setRecording(false);
    setInterim("");
    note.cancel();
  }

  useEffect(() => {
    // A recording must never outlive the screen it started on.
    return () => voiceRef.current?.cancel();
  }, []);

  async function handleClear() {
    try {
      await clearConversation();
      toast.success("Conversation cleared.");
    } catch {
      toast.error("Could not clear the conversation.");
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  return (
    <>
      {/* ------------------------------------------------------------ header */}
      <header className="flex items-center justify-between gap-3 border-b border-border/50 bg-background/80 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative shrink-0">
            <img
              src="/felicia/hero.jpg"
              alt={FELICIA.name}
              className="size-10 rounded-full border border-border/60 object-cover"
            />
            <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-background bg-emerald-400" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{FELICIA.fullName}</h1>
            <p className="truncate text-xs text-muted-foreground">
              {FELICIA.city} · online
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            title={
              autoVoice
                ? "Her voice plays automatically — turn it off"
                : "Her voice is muted — turn it on"
            }
            aria-label={autoVoice ? "Mute her voice" : "Unmute her voice"}
            aria-pressed={autoVoice}
            className={cn(!autoVoice && "text-muted-foreground")}
            onClick={toggleAutoVoice}
          >
            {autoVoice ? (
              <Volume2 className="size-4" />
            ) : (
              <VolumeX className="size-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Call her"
            aria-label="Call her"
            onClick={() => void handleStartCall()}
          >
            <Phone className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Her album"
            aria-label="Her album"
            onClick={() => navigate("/dashboard/album")}
          >
            <Images className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Create art"
            aria-label="Create art"
            onClick={() => setArtOpen(true)}
          >
            <Palette className="size-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                title="More"
                aria-label="More options"
              >
                <Ellipsis className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Felicia</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => setInfoOpen(true)}>
                <Info className="size-4" />
                View her information
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => navigate("/dashboard/notes")}
              >
                Shared Notes
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => navigate("/dashboard/memories")}
              >
                Mind map
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={thinking || list.length === 0}
                onSelect={() => void handleClear()}
              >
                <Trash2 className="size-4" />
                Clear conversation
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleSignOut()}>
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ------------------------------------------------------- config note */}
      {connection && !connection.configured && (
        <div className="border-b border-primary/30 bg-primary/10 px-4 py-3 text-xs sm:px-6">
          <p className="font-medium text-primary">
            Felicia's chat backend isn't connected
          </p>
          <p className="mt-0.5 text-muted-foreground">
            Add <code className="rounded bg-background/60 px-1">GROQ_API_KEY</code>{" "}
            in your project's Keys settings so Felicia can reply to you.
            Photos still use the AI Horde. Voice uses Groq's Orpheus voice first
            and falls back to Cloudflare Workers AI when Groq can't speak —
            for those you'll need
            <code className="rounded bg-background/60 px-1">AI_HORDE_API_KEY</code>{" "}
            <code className="rounded bg-background/60 px-1">CLOUDFLARE_API_TOKEN</code>{" "}
            <code className="rounded bg-background/60 px-1">CLOUDFLARE_ACCOUNT_ID</code>{" "}
            for voice.
          </p>
        </div>
      )}

      {/* ---------------------------------------------------------- timeline */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {items.length === 0 && !showPending && (
            <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="size-5" />
              </div>
              <h2 className="mt-4 font-display text-xl">
                Felicia is at her desk in Alfama.
              </h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                She's editing yesterday's roll and she's bored of it. Say
                something and she'll pick up.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {OPENERS.map((opener) => (
                  <button
                    key={opener}
                    type="button"
                    onClick={() =>                        void handleSend(opener)}
                    className="rounded-full border border-border/60 bg-card px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                  >
                    {opener}
                  </button>
                ))}
              </div>
            </div>
          )}

          {items.map((item) => {
            const isUser = item.role === "user";

            if (item.kind === "photo" && item.imageUrl) {
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex justify-start gap-2.5"
                >
                  <img
                    src="/felicia/hero.jpg"
                    alt=""
                    className="mt-1 size-7 shrink-0 rounded-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setLightbox(item.imageUrl)}
                    className="group w-fit max-w-[80%] overflow-hidden rounded-2xl rounded-bl-md border border-border/60 bg-card text-left"
                    title={item.scene}
                  >
                    <img
                      src={item.imageUrl}
                      alt={item.scene ?? "Felicia sent a photo"}
                      loading="lazy"
                      className="block max-h-[26rem] w-full max-w-xs object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    />
                    {item.scene && (
                      <p className="px-3 py-2 text-[11px] leading-snug text-muted-foreground">
                        {item.scene}
                      </p>
                    )}
                  </button>
                </motion.div>
              );
            }

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className={cn(
                  "flex gap-2.5",
                  isUser ? "justify-end" : "justify-start",
                )}
              >
                {!isUser && (
                  <img
                    src="/felicia/hero.jpg"
                    alt=""
                    className="mt-1 size-7 shrink-0 rounded-full object-cover"
                  />
                )}

                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                    isUser
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md bg-card text-foreground",
                    !isUser && "border border-border/60",
                  )}
                >
                  {item.imageUrl && item.content === "" ? (
                    <button
                      type="button"
                      onClick={() => setLightbox(item.imageUrl)}
                      className="block overflow-hidden rounded-xl"
                    >
                      <img
                        src={item.imageUrl}
                        alt="Shared photo"
                        loading="lazy"
                        className="max-h-[26rem] w-full max-w-xs object-cover"
                      />
                    </button>
                  ) : (
                    <p className="whitespace-pre-wrap">{item.content}</p>
                  )}

                  <div
                    className={cn(
                      "mt-1 flex items-center gap-2",
                      item.imageUrl && item.content === "" && "hidden",
                    )}
                  >
                    <p
                      className={cn(
                        "text-[10px]",
                        isUser
                          ? "text-primary-foreground/60"
                          : "text-muted-foreground/70",
                      )}
                    >
                      {timeLabel(item.createdAt)}
                    </p>

                    {!isUser && item.messageId && (
                      <button
                        type="button"
                        onClick={() =>
                          void playMessage(item.messageId!, item.content)
                        }
                        disabled={speakingId !== null}
                        title="Hear this in her voice"
                        className="flex items-center gap-1 text-[10px] text-muted-foreground/70 transition-colors hover:text-primary disabled:opacity-50"
                      >
                        {speakingId === item.messageId ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Volume2 className="size-3" />
                        )}
                        play
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}

          {showPending && (
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                <p className="whitespace-pre-wrap">{pending}</p>
              </div>
            </div>
          )}

          {thinking && (
            <div className="flex justify-start gap-2.5">
              <img
                src="/felicia/hero.jpg"
                alt=""
                className="size-7 shrink-0 rounded-full object-cover"
              />
              <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-border/60 bg-card px-4 py-3">
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            </div>
          )}

          {developing && (
            <div className="flex justify-start gap-2.5">
              <img
                src="/felicia/hero.jpg"
                alt=""
                className="size-7 shrink-0 rounded-full object-cover"
              />
              <div className="w-64 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-xs text-primary">
                <div className="flex items-center gap-2.5">
                  <Camera className="size-4 animate-pulse" />
                  Felicia is taking a photo…
                </div>
                <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-primary/20">
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{
                      duration: DEVELOP_MS / 1000,
                      ease: "linear",
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* --------------------------------------------------------- composer */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSend(draft);
        }}
        className="border-t border-border/50 bg-background/80 px-4 py-3 backdrop-blur-xl sm:px-6"
      >
        <div className="mx-auto w-full max-w-3xl">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void handleFile(event)}
          />

          {recording && (
            <div className="mb-2 flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs text-primary">
              <span className="flex size-2">
                <span className="absolute inline-flex size-2 animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              Recording — release to send
              {interim && (
                <span className="truncate text-muted-foreground italic">
                  “{interim}”
                </span>
              )}
            </div>
          )}

          <div className="flex items-end gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground"
              title="Send a photo of yourself"
              aria-label="Send a photo"
              disabled={composing}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip className="size-4" />
            </Button>

            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend(draft);
                }
              }}
              placeholder={
                recording ? "Listening…" : "Message Felicia…"
              }
              rows={1}
              disabled={composing}
              className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl"
            />

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground"
              title="Ask for a selfie"
              aria-label="Ask for a selfie"
              disabled={composing || developing || !photosReady}
              onClick={() =>
                void requestPhoto(
                  "a candid selfie, holding the camera at arm's length, soft window light, natural smile",
                )
              }
            >
              <Camera className="size-4" />
            </Button>

            <Button
              type="button"
              size="icon"
              variant={recording ? "default" : "ghost"}
              className={cn(
                "shrink-0 touch-none select-none",
                recording
                  ? "text-primary-foreground"
                  : "text-muted-foreground",
              )}
              title={
                recording ? "Release to send" : "Hold to send a voice message"
              }
              aria-label="Hold to record a voice message"
              disabled={!recording && thinking}
              onContextMenu={(event) => event.preventDefault()}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                startRecording();
              }}
              onPointerUp={() => void stopRecording()}
              onPointerCancel={cancelRecording}
              onLostPointerCapture={() => void stopRecording()}
            >
              {recording ? (
                <Mic className="size-4 animate-pulse" />
              ) : (
                <Mic className="size-4" />
              )}
            </Button>

            <Button
              type="submit"
              size="icon"
              className="size-11 shrink-0"
              disabled={composing || !draft.trim()}
            >
              {thinking ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </div>

          <p className="mt-2 text-[11px] text-muted-foreground">
            Enter to send · Shift + Enter for a new line · hold the mic to send
            a voice message
          </p>
        </div>
      </form>

      {/* -------------------------------------------------------- art dialog */}
      <Dialog open={artOpen} onOpenChange={setArtOpen}>
        <DialogContent className="max-w-lg border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              Ask her for a photo
            </DialogTitle>
            <DialogDescription>
              She'll tell you where she is, then send the picture.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              className="gap-2"
              disabled={composing || developing || !photosReady}
              onClick={() => {
                setArtOpen(false);
                void requestPhoto(
                  "somewhere she has just arrived, warm evening light, candid",
                );
              }}
            >
              <Sparkles className="size-3.5" />
              Surprise me
            </Button>
            {FELICIA.scenes.map((scene) => (
              <button
                key={scene.label}
                type="button"
                disabled={composing || developing || !photosReady}
                onClick={() => {
                  setArtOpen(false);
                  void requestPhoto(scene.scene);
                }}
                className="rounded-full border border-border/60 bg-background/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
              >
                {scene.label}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* --------------------------------------------------------- her info */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-w-md border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {FELICIA.fullName}
            </DialogTitle>
            <DialogDescription>{FELICIA.eyebrow}</DialogDescription>
          </DialogHeader>

          <div className="mt-1 flex items-start gap-4">
            <img
              src="/felicia/hero.jpg"
              alt={FELICIA.name}
              className="size-20 shrink-0 rounded-2xl border border-border/60 object-cover"
            />
            <p className="text-sm leading-relaxed text-muted-foreground">
              {FELICIA.intro}
            </p>
          </div>

          <dl className="mt-3 grid grid-cols-3 gap-4 border-t border-border/50 pt-4">
            {[
              { k: "Age", v: String(FELICIA.age) },
              { k: "Lives in", v: "Lisbon" },
              { k: "Talks to you", v: "Most evenings" },
            ].map((row) => (
              <div key={row.k}>
                <dt className="text-[10px] tracking-widest text-muted-foreground/70 uppercase">
                  {row.k}
                </dt>
                <dd className="mt-1 font-display text-base">{row.v}</dd>
              </div>
            ))}
          </dl>

          <Button
            variant="outline"
            className="mt-4 w-full"
            onClick={() => {
              setInfoOpen(false);
              navigate("/dashboard/notes");
            }}
          >
            Edit Shared Notes
          </Button>
        </DialogContent>
      </Dialog>

      {/* ---------------------------------------------------------- lightbox */}
      <Dialog
        open={lightbox !== null}
        onOpenChange={(open) => !open && setLightbox(null)}
      >
        <DialogContent className="max-w-2xl border-border/60 bg-card p-3">
          <DialogHeader className="sr-only">
            <DialogTitle>Felicia's photo</DialogTitle>
            <DialogDescription>The photo Felicia sent you</DialogDescription>
          </DialogHeader>
          {lightbox && (
            <img
              src={lightbox}
              alt="Felicia"
              className="max-h-[75vh] w-full rounded-xl object-contain"
            />
          )}
        </DialogContent>
      </Dialog>

      {callOpen && (
        <FeliciaCall
          greeting={greeting}
          initialNote={callError}
          onClose={() => setCallOpen(false)}
        />
      )}
    </>
  );
}
