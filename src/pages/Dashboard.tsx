import { FeliciaCall, type CallGreeting } from "@/components/FeliciaCall";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { useFeliciaAvatar } from "@/hooks/use-felicia-avatar";
import { FELICIA } from "@/lib/felicia";
import { FELICIA_GALLERY, galleryOriginal } from "@/lib/gallery";
import { DEVELOP_MS, preloadImage } from "@/lib/photo";
import { cn, friendlyError, isTransientError } from "@/lib/utils";
import {
  beginVoiceNote,
  playAudioUrl,
  speakWithBrowser,
  unlockAudio,
} from "@/lib/voice";
import {
  useAction,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { motion } from "framer-motion";
import {
  Camera,
  Check,
  Clock,
  Ellipsis,
  Images,
  Info,
  Loader2,
  Mic,
  Paperclip,
  Phone,
  Send,
  Sparkle,
  Sparkles,
  Video,
  Volume2,
  VolumeX,
  Brain,
  Heart,
  History,
  MessageSquare,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const AUTO_VOICE_KEY = "felicia:auto-voice";

function readAutoVoicePref(): boolean {
  try {
    const stored = window.localStorage.getItem(AUTO_VOICE_KEY);
    return stored === null ? true : stored === "1";
  } catch {
    return true;
  }
}

/** How many messages "load earlier" pulls in at a time. */
const MESSAGE_PAGE_SIZE = 80;

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

/** How many of the newest messages get a staggered entrance when the chat
 *  opens — the older ones are already-read history and simply are there. */
const ENTRANCE_WINDOW = 24;

/** Ambient stars scattered behind the conversation — decoration only, and
 *  every one runs on its own clock so the field never pulses in unison. */
const CHAT_SPARKLES = [
  { key: "s1", top: "3%", left: "5%", size: 16, delay: 0, duration: 4.4 },
  { key: "s2", top: "11%", left: "89%", size: 12, delay: 1.1, duration: 5.6 },
  { key: "s3", top: "24%", left: "2%", size: 10, delay: 2.4, duration: 6.2 },
  { key: "s4", top: "37%", left: "94%", size: 15, delay: 0.6, duration: 4.8 },
  { key: "s5", top: "51%", left: "4%", size: 11, delay: 3.2, duration: 5.9 },
  { key: "s6", top: "64%", left: "91%", size: 9, delay: 1.8, duration: 4.6 },
  { key: "s7", top: "77%", left: "9%", size: 13, delay: 2.9, duration: 6.4 },
  { key: "s8", top: "89%", left: "84%", size: 11, delay: 0.3, duration: 5.2 },
];

/** Where the sparkles fly when one of her replies lands. */
const SPARKLE_BURST = [
  { dx: -22, dy: -18, delay: 0 },
  { dx: 16, dy: -24, delay: 0.08 },
  { dx: 26, dy: 8, delay: 0.16 },
  { dx: -14, dy: 14, delay: 0.24 },
];

type TimelineItem = {
  id: string;
  kind: "message" | "photo";
  role: "user" | "felicia";
  createdAt: number;
  content: string;
  imageUrl: string | null;
  /** The original upload, for the lightbox. Falls back to `imageUrl`. */
  fullUrl?: string | null;
  scene?: string;
  label?: string | null;
  messageId?: Id<"messages">;
};

/** A photo waiting in the picker, with a local preview URL. */
type StagedPhoto = {
  id: string;
  file: File;
  url: string;
};

/** A photo as `api.felicia.photos` returns it, with its URL already resolved. */
type PhotoRow = {
  _id: unknown;
  createdAt: number;
  url?: string | null;
  galleryId?: string | null;
  scene?: string | null;
  label?: string | null;
};

export default function Dashboard() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const avatarUrl = useFeliciaAvatar();

  const messagePages = usePaginatedQuery(
    api.felicia.messagesPage,
    {},
    { initialNumItems: MESSAGE_PAGE_SIZE },
  );
  const photos = useQuery(api.felicia.photos);
  const connection = useQuery(api.felicia.connectorStatus);
  /**
   * An empty chat still has a past: earlier guest sessions of this app keep
   * their history under the guest id that made it, so the empty state can offer
   * to fold them back in instead of showing nothing. Only asked for while the
   * transcript is empty, and skipped the rest of the time.
   */
  const chatIsEmpty =
    messagePages.results.length === 0 &&
    messagePages.status !== "LoadingFirstPage";
  const earlier = useQuery(
    api.accounts.earlierSessions,
    chatIsEmpty ? {} : "skip",
  );
  const restoreEarlier = useMutation(api.accounts.restoreEarlierSessions);
  const [restoring, setRestoring] = useState(false);
  const sendMessage = useAction(api.felicia.sendMessage);
  const generatePhoto = useAction(api.felicia.generatePhoto);
  const sendUserPhoto = useAction(api.felicia.sendUserPhoto);
  const speakChunk = useAction(api.felicia.speakChunk);
  const startCall = useAction(api.felicia.startCall);

  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [developing, setDeveloping] = useState(false);
  const [hiddenCount, setHiddenCount] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [callOpen, setCallOpen] = useState(false);
  const [callVideo, setCallVideo] = useState(false);
  const [greeting, setGreeting] = useState<CallGreeting | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [pendingPhotoScene, setPendingPhotoScene] = useState<string | null>(null);
  /** Delay in ms before the developing photo reveals; null when nothing is cooking. */
  const [photoScheduledAt, setPhotoScheduledAt] = useState<number | null>(null);
  const photoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [infoOpen, setInfoOpen] = useState(false);
  /**
   * The picker stages candidates locally first: she receives only the photo
   * that was actually chosen, not every file that passed through the chooser.
   */
  const [pickerOpen, setPickerOpen] = useState(false);
  const [staged, setStaged] = useState<StagedPhoto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sendingPhoto, setSendingPhoto] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  /**
   * Her captions, one tap away from the composer. Typing "send me <caption>"
   * works too, but nobody remembers the wording of a title they scrolled past
   * once, so the list is searchable and the exact wording is filled in for you.
   */
  const [rollOpen, setRollOpen] = useState(false);
  const [rollTerm, setRollTerm] = useState("");
  /** The id of the reply that should shimmer when it arrives. */
  const [sparkleBurstId, setSparkleBurstId] = useState<string | null>(null);
  /**
   * The chat should feel like it *arrives* when you open it: the newest
   * messages cascade in, older history is simply there. This flips off shortly
   * after first paint, so messages that land later (a live reply) never wait.
   */
  const [firstPaint, setFirstPaint] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setFirstPaint(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  // On this day + archive search. The search sits idle ("skip") until two real
  // characters land, debounced, so typing doesn't fire a query per keystroke.
  const memoryDay = useQuery(api.felicia.onThisDay);
  const [dismissedMemory, setDismissedMemory] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const searchResults = useQuery(
    api.felicia.searchMessages,
    debouncedTerm.trim().length >= 2 ? { term: debouncedTerm.trim() } : "skip",
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTerm(term), 250);
    return () => clearTimeout(timer);
  }, [term]);
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [autoVoice, setAutoVoice] = useState(readAutoVoicePref);

  const autoVoiceRef = useRef(autoVoice);
  const speakingRef = useRef<Id<"messages"> | null>(null);

  useEffect(() => {
    autoVoiceRef.current = autoVoice;
  }, [autoVoice]);

  useEffect(() => {
    if (photoTimerRef.current) {
      clearTimeout(photoTimerRef.current);
      photoTimerRef.current = null;
    }
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  /** Distance from the bottom, kept across a "load earlier" so the view holds. */
  const restoreScrollRef = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const voiceRef = useRef<{
    end: () => Promise<string | null>;
    cancel: () => void;
  } | null>(null);

  // Pages arrive newest-first so "load earlier" can walk all the way back; the
  // transcript itself reads oldest-to-newest.
  const list = [...(messagePages.results ?? [])].reverse();
  /**
   * The transcript as it stands on this render, for the retry check below.
   * A failed send has to look at what is on screen now, not at whatever the
   * closure captured when the send started.
   */
  const listRef = useRef(list);
  // A ref is only written outside render; the transcript-as-of-now for the
  // retry check trails its render by a commitment, which is close enough — the
  // send retries read it only after the message list has settled.
  useEffect(() => {
    listRef.current = list;
  }, [list]);
  const lastUserMessage = [...list].reverse().find((m) => m.role === "user");
  const showPending = pending !== null && lastUserMessage?.content !== pending;
  const composing = thinking || recording;

  const missingKeys = connection
    ? [
        connection.configured === false &&
          "GROQ_API_KEY — her chat, memory and voice",
        connection.imageConfigured === false &&
          "CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID — her photos and her eyes",
      ].filter((value): value is string => Boolean(value))
    : [];

  const allPhotos = photos ?? [];
  const photosReady = photos !== undefined;

  const hiddenPhotoIds = new Set<string>();
  if (hiddenCount !== null) {
    const fresh = allPhotos.slice(
      0,
      Math.max(0, allPhotos.length - hiddenCount),
    );
    for (const photo of fresh) hiddenPhotoIds.add(String(photo._id));
  }

  const items: TimelineItem[] = [
    ...list.map((message: { _id: Id<"messages">; role: "user" | "felicia"; createdAt: number; content: string; imageUrl: string | null }) => ({
      id: `m${message._id}`,
      kind: "message" as const,
      role: message.role,
      createdAt: message.createdAt,
      content: message.content,
      imageUrl: message.imageUrl,
      messageId: message._id,
    })),
    ...allPhotos
      .filter((photo: PhotoRow) => !hiddenPhotoIds.has(String(photo._id)))
      .map((photo: PhotoRow) => ({
        id: `p${photo._id}`,
        kind: "photo" as const,
        role: "felicia" as const,
        createdAt: photo.createdAt,
        content: "",
        imageUrl: photo.url ?? null,
        // Gallery photos are stored as the small tile, which is what the bubble
        // should draw; opening one shows the original upload instead.
        fullUrl: galleryOriginal(photo.galleryId ?? undefined) ?? photo.url ?? null,
        scene: photo.scene ?? undefined,
        label: photo.label ?? null,
      })),
  ].sort((a, b) => a.createdAt - b.createdAt);

  // Follow the newest line only. Keyed on the last item rather than the count,
  // so loading older messages above does not yank the reader to the bottom.
  const lastItemId = items[items.length - 1]?.id;
  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lastItemId, showPending, developing, interim]);

  // Older messages are prepended above, so the reader keeps their place: the
  // distance from the bottom is remembered and put back.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node || restoreScrollRef.current === null) return;
    node.scrollTop = node.scrollHeight - restoreScrollRef.current;
    restoreScrollRef.current = null;
  }, [list.length]);

  function loadEarlierMessages() {
    const node = scrollRef.current;
    if (node) restoreScrollRef.current = node.scrollHeight - node.scrollTop;
    void messagePages.loadMore(MESSAGE_PAGE_SIZE);
  }

  /**
   * A stable function, not a fresh one per render.
   *
   * The reveal timer below is armed with this function, so an unstable
   * identity would tear the timer down and re-arm it on every render — a
   * churny transcript could keep the developing photo from ever finishing.
   */
  const requestPhoto = useCallback(async (scene: string) => {
    if (!photosReady) return;

    setHiddenCount(allPhotos.length);
    setDeveloping(true);
    try {
      const result = await generatePhoto({ scene });
      if (result.url) await preloadImage(result.url);
    } catch (error) {
      toast.error(friendlyError(error, "Felicia couldn't send that photo."));
    } finally {
      setDeveloping(false);
      setHiddenCount(null);
    }
  }, [allPhotos.length, generatePhoto, photosReady]);

  useEffect(() => {
    if (photoScheduledAt === null) return;
    // A zero-delay timeout rather than a synchronous setState: the reveal is
    // always dispatched from the timer, so this effect never cascades a render.
    const timer = setTimeout(() => {
      setPhotoScheduledAt(null);
      if (pendingPhotoScene) void requestPhoto(pendingPhotoScene);
      setPendingPhotoScene(null);
    }, photoScheduledAt);
    photoTimerRef.current = timer;
    return () => {
      clearTimeout(timer);
      photoTimerRef.current = null;
    };
  }, [pendingPhotoScene, photoScheduledAt, requestPhoto]);

  async function handleStartCall(video = false) {
    // Straight from the tap, before anything is awaited: browsers (and iOS in
    // particular) only grant sound to a page that asked while being touched.
    unlockAudio();
    setGreeting(null);
    setCallError(null);
    setCallVideo(video);
    setCallOpen(true);
    try {
      setGreeting(await startCall({}));
    } catch (error) {
      // The call screen opens either way — a line from the backend is a note,
      // not the end of the call — so it gets the same plain sentence a person
      // would get, not the Convex wrapper with a stack trace in it.
      setCallError(
        friendlyError(error, "Felicia didn't pick up — say something to her instead."),
      );
    }
  }

  async function playMessage(messageId: Id<"messages">, content: string) {
    // Same gate as a call: this is a click, so the page gets to make sound.
    unlockAudio();
    if (speakingRef.current) return;
    speakingRef.current = messageId;
    setSpeakingId(messageId);
    try {
      // Her real voice is Groq's text-to-speech, the same key as her chat. The
      // device voice is only there for when that can't render a line.
      //
      // It is asked for in pieces: the opening phrase is rendered first, with
      // the piece after it rendering in parallel, so she starts talking as soon
      // as a phrase exists rather than after the whole line does.
      let played = false;
      const queue: Array<Promise<{ url: string | null; total: number }>> = [
        speakChunk({ messageId, index: 0 }),
        speakChunk({ messageId, index: 1 }),
      ];
      let index = 0;
      let total = Infinity;
      while (index < total && speakingRef.current === messageId) {
        const chunk = await queue.shift();
        if (!chunk) break;
        total = chunk.total;
        if (index + 2 < total) {
          queue.push(speakChunk({ messageId, index: index + 2 }));
        }
        if (!chunk.url) break;
        const spoke = await playAudioUrl(chunk.url);
        played = played || spoke;
        index += 1;
      }
      if (!played) await speakWithBrowser(content);
    } catch (error) {
      // A line she cannot render is read out by the device voice instead, so
      // this is a note and not the end of the feature.
      toast.error(friendlyError(error, "Felicia couldn't speak just now."));
    } finally {
      speakingRef.current = null;
      setSpeakingId(null);
    }
  }

  function toggleAutoVoice() {
    const next = !autoVoice;
    setAutoVoice(next);
    try {
      window.localStorage.setItem(AUTO_VOICE_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
  }

  /**
   * Send one line, and survive a dropped socket.
   *
   * "Connection lost while action was in flight" is not about the message: the
   * socket restarted while the action was travelling, and Convex cannot say
   * whether it ran. So the transcript is checked first — when the line did
   * arrive, her reply is already on its way and sending it again would double
   * it — and only a line that genuinely did not land is sent a second time.
   */
  async function sendMessageSafely(text: string) {
    try {
      return await sendMessage({ text });
    } catch (error) {
      if (!isTransientError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const landed = listRef.current.some(
        (message) => message.role === "user" && message.content === text,
      );
      if (landed) return null;
      return await sendMessage({ text });
    }
  }

  async function handleSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed || composing) return;

    setDraft("");
    setPending(trimmed);
    setThinking(true);

    try {
      const result = await sendMessageSafely(trimmed);
      setPending(null);
      setThinking(false);
      if (!result) return;
      setSparkleBurstId(String(result.replyMessageId));
      if (autoVoiceRef.current) {
        void playMessage(result.replyMessageId, result.reply);
      }
      if (result.photoUrl) {
        // She picked one she already had, so it is on its way the moment her
        // reply lands. Waiting on the decode is all that is left to do.
        await preloadImage(result.photoUrl);
      } else if (result.photoScene) {
        setPendingPhotoScene(result.photoScene);
        setPhotoScheduledAt(result.photoReadyAfterMs || 8000);
      }
    } catch (error) {
      setPending(null);
      setThinking(false);
      // The words are handed back rather than lost: a dropped connection is
      // not their fault, and retyping a message they already wrote is the
      // worst part of one. Anything typed since is left alone.
      setDraft((current) => current || trimmed);
      toast.error(friendlyError(error, "Felicia didn't get that — try again."));
    }
  }

  /** Preview URLs live only while the picker does; drop them on unmount. */
  const stagedRef = useRef<StagedPhoto[]>([]);
  useEffect(() => {
    stagedRef.current = staged;
  }, [staged]);
  useEffect(
    () => () => {
      for (const photo of stagedRef.current) URL.revokeObjectURL(photo.url);
    },
    [],
  );

  /** Throw away every candidate and the preview URLs they came with. */
  function clearStaged() {
    for (const photo of staged) URL.revokeObjectURL(photo.url);
    setStaged([]);
    setSelectedId(null);
  }

  /** Files the chooser or a drop handed over — validated, then staged. */
  function addPhotos(files: FileList | File[]) {
    const accepted: StagedPhoto[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        toast.error("Send an image file.");
        continue;
      }
      if (file.size > 6_000_000) {
        toast.error("That photo is over 6 MB — try a smaller one.");
        continue;
      }
      accepted.push({
        id: `${file.lastModified}-${accepted.length}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        file,
        url: URL.createObjectURL(file),
      });
    }
    if (accepted.length === 0) return;
    setStaged((current) => [...current, ...accepted]);
    setSelectedId((current) => current ?? accepted[0]?.id ?? null);
  }

  function stageChosenFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    event.target.value = "";
    if (files && files.length > 0) addPhotos(files);
  }

  function dropStaged(id: string) {
    const photo = staged.find((item) => item.id === id);
    if (photo) URL.revokeObjectURL(photo.url);
    const next = staged.filter((item) => item.id !== id);
    setStaged(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
  }

  /** Only the selected photo leaves the device. */
  async function sendSelectedPhoto() {
    const photo = staged.find((item) => item.id === selectedId);
    if (!photo || sendingPhoto || composing) return;

    setSendingPhoto(true);
    setThinking(true);
    try {
      const data = await photo.file.arrayBuffer();
      const result = await sendUserPhoto({ data, mimeType: photo.file.type });
      setPickerOpen(false);
      clearStaged();
      setSparkleBurstId(String(result.replyMessageId));
      toast.success("Sent — Felicia is looking at it.");
      if (autoVoiceRef.current) {
        void playMessage(result.replyMessageId, result.reply);
      }
    } catch (error) {
      toast.error(friendlyError(error, "That photo didn't send."));
    } finally {
      setSendingPhoto(false);
      setThinking(false);
    }
  }

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
    return () => voiceRef.current?.cancel();
  }, []);

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  const selectedPhoto = staged.find((item) => item.id === selectedId);

  /** Her titles, narrowed by whatever is typed in the roll dialog. */
  const rollQuery = rollTerm.trim().toLowerCase();
  const rollMatches = FELICIA_GALLERY.filter(
    (photo) =>
      rollQuery.length === 0 ||
      photo.title.toLowerCase().includes(rollQuery) ||
      photo.tags.some((tag) => tag.includes(rollQuery)),
  );

  /** Ask her for one of her own pictures by its caption. */
  function askForTitle(title: string) {
    setRollOpen(false);
    setRollTerm("");
    void handleSend(`send me ${title}`);
  }

  return (
    <>
      {/* feed */}
      <div className="flex min-h-0 w-full flex-1 flex-col px-4 pt-4 sm:px-6 pb-4">
        <div className="glass sticky top-0 z-20 mx-auto flex w-full max-w-5xl items-center justify-between gap-3 rounded-2xl px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative shrink-0">
              <span className="absolute -inset-[3px] rounded-full bg-gradient-to-br from-primary/70 via-primary/25 to-transparent" />
              <img
                src={avatarUrl}
                alt={FELICIA.name}
                className="relative size-10 rounded-full border border-border/40 object-cover"
              />
              {/* Online: the little ring keeps breathing so the header reads as
                  live rather than a static screenshot. */}
              <span className="absolute right-0 bottom-0 flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-chart-2 opacity-70" />
                <span className="relative inline-flex size-2.5 rounded-full border-2 border-background bg-chart-2" />
              </span>
            </span>
            <div className="min-w-0">
              <h1 className="truncate font-display text-[17px] font-semibold tracking-tight">
                {FELICIA.fullName}
              </h1>
              <p className="truncate text-[11px] text-muted-foreground">
                {FELICIA.city} · here with you
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary"
              onClick={toggleAutoVoice}
              title={autoVoice ? "Voice replies on" : "Voice replies off"}
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
              className="max-sm:hidden rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary"
              onClick={() => void handleStartCall(false)}
              title="Call Felicia"
            >
              <Phone className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary"
              onClick={() => void handleStartCall(true)}
              title="Video call Felicia"
            >
              <Video className="size-4" />
            </Button>
            {/* On a phone the name is what matters: the two secondary actions
                move into the ⋯ menu so the header never squeezes her name down
                to a single letter. */}
            <Button
              variant="ghost"
              size="icon"
              className="max-sm:hidden rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary"
              onClick={() => navigate("/dashboard/album")}
              title="Her gallery"
            >
              <Images className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="max-sm:hidden rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary"
              onClick={() => setSearchOpen((open) => !open)}
              title="Search the conversation"
            >
              <Search className="size-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary"
                >
                  <Ellipsis className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Felicia</DropdownMenuLabel>
                {/* The voice call icon moves in here on a phone, where the
                    header only has room for one call button. */}
                <DropdownMenuItem
                  className="sm:hidden"
                  onSelect={() => void handleStartCall(false)}
                >
                  <Phone className="size-4" />
                  Voice call
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setInfoOpen(true)}>
                  <Info className="size-4" />
                  About her
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/dashboard/album")}>
                  <Images className="size-4" />
                  Album
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/dashboard/notes")}>
                  <MessageSquare className="size-4" />
                  Shared notes
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSearchOpen(true)}>
                  <Search className="size-4" />
                  Search the conversation
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/dashboard/memories")}>
                  <Brain className="size-4" />
                  Memories
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void handleSignOut()}>
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Search the whole archive — results show as they match; picking one
            closes the panel (the timeline itself is not a jump target). */}
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="glass mx-auto mt-2 w-full max-w-5xl shrink-0 rounded-2xl p-2.5"
          >
            <div className="flex items-center gap-2">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <Input
                autoFocus
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setSearchOpen(false);
                }}
                placeholder="Search everything the two of you have said…"
                className="h-8 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                title="Close search"
                onClick={() => {
                  setSearchOpen(false);
                  setTerm("");
                }}
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="mt-1 max-h-56 overflow-y-auto">
              {debouncedTerm.trim().length < 2 ? (
                <p className="px-1 py-1.5 text-[11px] text-muted-foreground/70">
                  Type at least two characters — every message you have both
                  sent is searchable.
                </p>
              ) : searchResults === undefined ? (
                <p className="px-1 py-1.5 text-[11px] text-muted-foreground/70">
                  Searching…
                </p>
              ) : searchResults.length === 0 ? (
                <p className="px-1 py-1.5 text-[11px] text-muted-foreground/70">
                  Nothing matches “{debouncedTerm.trim()}”.
                </p>
              ) : (
                searchResults.map((result: {
                  _id: unknown;
                  role: string;
                  content: string;
                  createdAt: number;
                }) => (
                  <button
                    key={String(result._id)}
                    type="button"
                    onClick={() => {
                      setSearchOpen(false);
                      setTerm("");
                    }}
                    className="block w-full rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-primary/10"
                  >
                    <p className="truncate text-[11px]">
                      <span className="text-primary">
                        {result.role === "user" ? "You" : "Felicia"}
                      </span>
                      <span className="text-muted-foreground/70">
                        {" "}·{" "}
                        {new Date(result.createdAt).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {result.content}
                    </p>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}

        <div className="relative flex min-h-0 flex-1 flex-col gap-3">
          {/* Ambient shimmer behind the conversation — never interactive. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
          >
            {CHAT_SPARKLES.map((star) => (
              <span
                key={star.key}
                className="chat-sparkle absolute block"
                style={{
                  top: star.top,
                  left: star.left,
                  width: star.size,
                  height: star.size,
                  animationDelay: `${star.delay}s`,
                  animationDuration: `${star.duration}s`,
                }}
              >
                <Sparkle className="h-full w-full" />
              </span>
            ))}
          </div>

          {missingKeys.length > 0 && connection && (
            <div className="relative z-10 border-b border-primary/30 bg-primary/10 px-4 py-3 text-xs">
              <p className="font-medium text-primary">Not connected on this deployment</p>
              <p className="mt-1 text-muted-foreground">
                Add {missingKeys.join(", ")} in this project's Keys settings.
              </p>
            </div>
          )}

            <div
              ref={scrollRef}
              className="relative z-10 min-h-0 flex-1 overflow-y-auto px-1 sm:px-2 pb-2"
            >
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
                {/* On this day — a real moment from an earlier year, surfaced only
                  when one exists. Dismissible, and it never invents one. */}
              {memoryDay &&
                memoryDay.year > 0 &&
                !dismissedMemory && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.32,
                      delay: 0.12,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="surface rounded-3xl px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-[10px] tracking-widest text-primary uppercase">
                          <History className="size-3" />
                          On this day · {memoryDay.year}
                        </p>
                        <div className="mt-1.5 space-y-1">
                          {memoryDay.messages.map((message: {
                            _id: unknown;
                            role: string;
                            content: string;
                          }) => (
                            <p
                              key={String(message._id)}
                              className="truncate text-xs text-muted-foreground"
                            >
                              <span className="text-foreground/80">
                                {message.role === "user" ? "You" : "Felicia"}:
                              </span>{" "}
                              {message.content}
                            </p>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        title="Hide this memory"
                        onClick={() => setDismissedMemory(true)}
                        className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </motion.div>
                )}

              {items.length === 0 &&
                !showPending &&
                messagePages.status !== "LoadingFirstPage" && (
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
                  className="flex flex-col items-center justify-center px-4 py-20 text-center sm:px-6"
                >
                  <motion.div
                    animate={{ scale: [1, 1.06, 1] }}
                    transition={{
                      duration: 1.2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="glow-warm relative flex size-20 items-center justify-center rounded-full bg-primary/10 text-primary"
                  >
                    <motion.span
                      animate={{ scale: [1, 1.18, 1] }}
                      transition={{
                        duration: 1.2,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      className="flex"
                    >
                      <Heart className="size-8" />
                    </motion.span>
                  </motion.div>
                  <h2 className="mt-6 font-display text-3xl tracking-tight">
                    Say something to her
                  </h2>
                  <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    She's already here, waiting. Type, hold the mic for a voice
                    message, or start with one of these.
                  </p>
                  <div className="mt-7 flex flex-wrap justify-center gap-2">
                    {OPENERS.map((opener, index) => (
                      <motion.button
                        key={opener}
                        type="button"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          delay: 0.15 + index * 0.07,
                          type: "spring",
                          stiffness: 420,
                          damping: 28,
                        }}
                        onClick={() => void handleSend(opener)}
                        className="surface rounded-full px-4 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.96 }}
                      >
                        {opener}
                      </motion.button>
                    ))}
                  </div>

                  {/* An empty chat is only empty because this browser arrived as
                      a new guest. The old conversations are still in the
                      database, so offer them back rather than letting them
                      look lost. */}
                  {earlier && earlier.sessions > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        delay: 0.32,
                        duration: 0.4,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="mt-6 w-full max-w-sm rounded-3xl border border-primary/25 bg-primary/5 px-4 py-3 text-left"
                    >
                      <p className="flex items-center gap-1.5 text-[10px] tracking-widest text-primary uppercase">
                        <History className="size-3" />
                        Earlier conversations
                      </p>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {earlier.messages > 0 &&
                          `${earlier.messages} message${earlier.messages === 1 ? "" : "s"}`}
                        {earlier.messages > 0 && earlier.videos > 0 && " and "}
                        {earlier.videos > 0 &&
                          `${earlier.videos} video${earlier.videos === 1 ? "" : "s"} in her gallery`}{" "}
                        from{" "}
                        {earlier.sessions === 1
                          ? "an earlier session"
                          : `${earlier.sessions} earlier sessions`}{" "}
                        of this app are still saved — they were made before this
                        account existed.
                      </p>
                      <Button
                        size="sm"
                        className="mt-3 w-full gap-2 rounded-full"
                        disabled={restoring}
                        onClick={async () => {
                          setRestoring(true);
                          try {
                            const result = await restoreEarlier({});
                            toast.success(
                              `Brought back ${result.moved} item${result.moved === 1 ? "" : "s"} — check your gallery too.`,
                            );
                          } catch (restoreError) {
                            toast.error(
                              friendlyError(
                                restoreError,
                                "Couldn't bring those conversations back.",
                              ),
                            );
                          } finally {
                            setRestoring(false);
                          }
                        }}
                      >
                        {restoring ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <History className="size-3.5" />
                        )}
                        Bring them back
                      </Button>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {messagePages.status === "CanLoadMore" && (
                <div className="flex flex-col items-center gap-1 py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-xs text-muted-foreground"
                    disabled={messagePages.isLoading}
                    onClick={loadEarlierMessages}
                  >
                    {messagePages.isLoading ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Clock className="size-3.5" />
                    )}
                    Load earlier messages
                  </Button>
                  <p className="text-[11px] text-muted-foreground/70">
                    Everything the two of you have said is kept — nothing here
                    expires.
                  </p>
                </div>
              )}

              {items.map((item, index) => {
                const isUser = item.role === "user";
                const position = index - (items.length - ENTRANCE_WINDOW);
                const isEntrance = firstPaint && position >= 0;
                const entranceDelay = isEntrance
                  ? Math.min(position, ENTRANCE_WINDOW - 1) * 0.035
                  : 0;

                if (item.kind === "photo" && item.imageUrl) {
                  return (
                    <motion.div
                      key={item.id}
                      initial={
                        isEntrance
                          ? { opacity: 0, y: 14, scale: 0.96 }
                          : false
                      }
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{
                        type: "spring",
                        stiffness: 420,
                        damping: 26,
                        delay: entranceDelay,
                      }}
                      className="flex justify-start gap-3"
                    >
                      <img
                        src={avatarUrl}
                        alt=""
                        className="mt-1 size-7 shrink-0 rounded-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setLightbox(item.fullUrl ?? item.imageUrl)
                        }
                        className="surface group w-fit max-w-[92%] overflow-hidden rounded-[1.35rem] rounded-bl-md text-left sm:max-w-[78%]"
                        title={item.scene}
                      >
                      {/* Her photos are shown at their own size, not shrunk
                          into a thumbnail: the original upload is what gets
                          drawn, so the taller the picture the bigger it is in
                          the thread — up to 70% of the screen, then it stops. */}
                      <img
                        src={item.fullUrl ?? item.imageUrl}
                        alt={item.label ?? item.scene ?? "Felicia sent a photo"}
                        loading="lazy"
                        className="block max-h-[70vh] w-auto max-w-full object-contain"
                      />
                      {(item.label ?? item.scene) && (
                        <p className="px-4 py-2.5 text-[11px] leading-snug text-muted-foreground">
                          {item.label ?? item.scene}
                        </p>
                      )}
                      </button>
                    </motion.div>
                  );
                }

                return (
                  <motion.div
                    key={item.id}                    initial={
                      isEntrance
                        ? { opacity: 0, y: 10, scale: 0.98 }
                        : false
                      }
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{
                      type: "spring",
                      stiffness: 520,
                        damping: 30,
                        delay: entranceDelay,
                      }}
                    className={cn(
                      "relative flex gap-3",
                      isUser ? "justify-end" : "justify-start",
                    )}
                  >
                    {/* ✨ her reply lands with a little shimmer */}
                    {!isUser &&
                      item.messageId !== undefined &&
                      sparkleBurstId === String(item.messageId) && (
                        <span
                          aria-hidden
                          className="pointer-events-none absolute -top-2 left-8 z-20"
                        >
                          {SPARKLE_BURST.map((burst) => (
                            <motion.span
                              key={`${burst.dx}-${burst.dy}`}
                              className="absolute text-primary"
                              initial={{
                                opacity: 0,
                                scale: 0.2,
                                x: 0,
                                y: 0,
                                rotate: -25,
                              }}
                              animate={{
                                opacity: [0, 1, 0],
                                scale: [0.2, 1.1, 0.35],
                                x: burst.dx,
                                y: burst.dy,
                                rotate: 35,
                              }}
                              transition={{
                                duration: 1.1,
                                delay: burst.delay,
                                ease: "easeOut",
                              }}
                            >
                              <Sparkle className="size-3.5" />
                            </motion.span>
                          ))}
                        </span>
                      )}

                    {!isUser && (
                      <span className="mt-1 shrink-0 self-start rounded-full bg-gradient-to-br from-primary/70 to-primary/20 p-[1.5px]">
                        <img
                          src={avatarUrl}
                          alt=""
                          className="size-7 rounded-full object-cover"
                        />
                      </span>
                    )}

                    <div
                      className={cn(
                        "max-w-[85%] px-4 py-2.5 text-sm leading-relaxed",
                        isUser
                          ? "rounded-[1.35rem] rounded-br-md bg-primary text-primary-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.14),0_14px_30px_-18px_var(--primary)]"
                          : "surface rounded-[1.35rem] rounded-tl-md text-foreground",
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
                            className="max-h-[30rem] max-w-full object-contain"
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
                <motion.div                    initial={{ opacity: 0, y: 10, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 580, damping: 28 }}
                    className="flex justify-end pb-2"
                  >
                    <div className="max-w-[85%] rounded-[1.35rem] rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.14),0_14px_30px_-18px_var(--primary)]">
                      <p className="whitespace-pre-wrap">{pending}</p>
                    </div>
                  </motion.div>
              )}

              {thinking && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 600, damping: 28 }}
                  className="flex justify-start gap-3 pb-2"
                >
                  <motion.span
                    animate={{ rotate: [0, -10, 10, 0] }}
                    transition={{
                      duration: 2.4,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="mt-1 shrink-0"
                  >
                    <img
                      src={avatarUrl}
                      alt=""
                      className="size-7 rounded-full object-cover"
                    />
                  </motion.span>
                  <div className="flex items-center gap-2 rounded-2xl rounded-tl-md border border-border/60 bg-card px-4 py-3">
                    <motion.span
                      animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.15, 1] }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      className="flex"
                    >
                      <Sparkles className="size-4 text-primary" />
                    </motion.span>
                    <span className="text-xs text-muted-foreground">she is typing</span>
                    <span className="ml-auto flex gap-0.5">
                      {[0, 150, 300].map((delay) => (
                        <motion.span
                          key={delay}
                          className="size-1.5 rounded-full bg-muted-foreground"
                          animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
                          transition={{
                            duration: 0.9,
                            repeat: Infinity,
                            delay: delay / 1000,
                            ease: "easeInOut",
                          }}
                        />
                      ))}
                    </span>
                  </div>
                </motion.div>
              )}

              {developing && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 560, damping: 28 }}
                  className="flex justify-start gap-3 pb-2"
                >
                  <motion.img
                    src={avatarUrl}
                    alt=""
                    animate={{ scale: [1, 1.06, 1] }}
                    transition={{
                      duration: 1.0,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="mt-1 size-7 shrink-0 rounded-full object-cover"
                  />
                  <motion.div
                    animate={{ borderColor: ["oklch(0.75 0.155 296 / 30%)", "oklch(0.75 0.155 296 / 75%)", "oklch(0.75 0.155 296 / 30%)"] }}
                    transition={{
                      duration: 1.8,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="w-72 rounded-t-2xl bg-primary/10 px-4 py-3 text-xs text-primary"
                    style={{ borderWidth: 1, borderStyle: "solid" }}
                  >
                    <div className="flex items-center gap-2">
                      <Camera className="size-4 animate-pulse" />
                      Felicia is taking a photo…
                    </div>
                    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-primary/20">
                      <motion.div
                        className="h-full rounded-full bg-primary"
                        initial={{ width: "0%" }}
                        animate={{ width: "100%" }}
                      transition={{
                        duration: (DEVELOP_MS - 1200) / 1000,
                        ease: "linear",
                      }}
                      />
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </div>
          </div>

          {/* composer — deliberately compact: one slim pill, nothing more. */}
          <div className="glass mx-auto w-full max-w-3xl shrink-0 rounded-2xl px-2.5 py-2">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleSend(draft);
              }}
            >
              <div className="flex w-full flex-col gap-1.5">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => stageChosenFiles(event)}
                />

                {recording && (
                  <div className="flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-[11px] text-primary">
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

                <div className="surface flex items-end gap-0.5 rounded-full py-1 pl-1 pr-1 transition-shadow focus-within:ring-1 focus-within:ring-primary/30">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary"
                    title="Choose a photo to send"
                    disabled={composing}
                    onClick={() => setPickerOpen(true)}
                  >
                    <Paperclip className="size-3.5" />
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary"
                    title="Ask for one of her pictures"
                    disabled={composing}
                    onClick={() => setRollOpen(true)}
                  >
                    <Images className="size-3.5" />
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
                    placeholder="Message Felicia…"
                    rows={1}
                    disabled={composing}
                    className="max-h-28 min-h-8 flex-1 resize-none border-0 bg-transparent py-1.5 text-sm shadow-none focus-visible:ring-0"
                  />

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary"
                    title="Ask for a selfie"
                    disabled={composing || developing || !photosReady}
                    onClick={() =>
                      void requestPhoto(
                        "a candid selfie, holding the camera at arm's length, soft window light, natural smile",
                      )
                    }
                  >
                    <Camera className="size-3.5" />
                  </Button>

                  <Button
                    type="button"
                    size="icon"
                    variant={recording ? "default" : "ghost"}
                    className={cn(
                      "size-8 shrink-0 touch-none select-none rounded-full",
                      recording
                        ? "lift-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-primary/10 hover:text-primary",
                    )}
                    title={recording ? "Release to send" : "Hold to send a voice message"}
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
                      <Mic className="size-3.5 animate-pulse" />
                    ) : (
                      <Mic className="size-3.5" />
                    )}
                  </Button>

                  <Button
                    type="submit"
                    size="icon"
                    className="lift-primary size-8 shrink-0 rounded-full transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
                    disabled={composing || !draft.trim()}
                  >
                    {thinking ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                  </Button>
                </div>

                <p className="text-center text-[10px] text-muted-foreground/70">
                  Type or hold the mic to record
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* her info */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-w-md border-border/60 bg-card/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl tracking-tight">
              {FELICIA.fullName}
            </DialogTitle>
            <DialogDescription>{FELICIA.traits[0].title}</DialogDescription>
          </DialogHeader>

          <div className="mt-1 flex items-start gap-4">
            <img
              src={avatarUrl}
              alt={FELICIA.name}
              className="size-20 shrink-0 rounded-3xl border border-border/40 object-cover shadow-lg"
            />
            <p className="text-sm leading-relaxed text-muted-foreground">
              {FELICIA.fullName} is {FELICIA.age} and lives in {FELICIA.city}. She
              makes a living filming and photographing the city, and she keeps
              everything the two of you have ever said to each other — every
              conversation, however long ago. She texts like a real person: short
              messages, real opinions, and an actual memory for what you told her.
            </p>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-4 border-t border-border/50 pt-4">
            {[
              { k: "Based in", v: FELICIA.city },
              { k: "Works as", v: FELICIA.traits[0].title },
              { k: "Neighborhood", v: FELICIA.neighborhood },
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

      {/* her roll — every caption she has, searchable, one tap to ask for it */}
      <Dialog
        open={rollOpen}
        onOpenChange={(open) => {
          setRollOpen(open);
          if (!open) setRollTerm("");
        }}
      >
        <DialogContent className="max-w-md gap-0 overflow-hidden border-border/60 bg-card/95 p-0 backdrop-blur-xl">
          <DialogHeader className="border-b border-border/50 px-5 py-4">
            <DialogTitle className="font-display text-xl tracking-tight">
              Her pictures
            </DialogTitle>
            <DialogDescription>
              Tap a title and she sends that exact photo.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 border-b border-border/50 px-4 py-2">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              autoFocus
              value={rollTerm}
              onChange={(event) => setRollTerm(event.target.value)}
              placeholder="Search her titles…"
              className="h-8 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
            {rollTerm.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                title="Clear"
                onClick={() => setRollTerm("")}
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>

          <div className="max-h-[52vh] overflow-y-auto p-2">
            {rollMatches.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground/70">
                Nothing she has is called “{rollTerm.trim()}”.
              </p>
            ) : (
              rollMatches.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => askForTitle(photo.title)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-primary/10"
                >
                  <img
                    src={photo.thumbUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={(event) => {
                      const image = event.currentTarget;
                      image.onerror = null;
                      image.src = photo.url;
                    }}
                    className="size-10 shrink-0 rounded-lg border border-border/40 object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-foreground">
                      {photo.title}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground/70">
                      {photo.tags.slice(0, 3).join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] text-primary">
                    ask
                  </span>
                </button>
              ))
            )}
          </div>

          <p className="border-t border-border/50 px-5 py-2.5 text-[10px] text-muted-foreground/70">
            {FELICIA_GALLERY.length} pictures · tap one to send “send me …”
          </p>
        </DialogContent>
      </Dialog>

      {/* lightbox */}
      <Dialog
        open={lightbox !== null}
        onOpenChange={(open) => !open && setLightbox(null)}
      >
        <DialogContent className="max-w-3xl border-border/60 bg-card p-3">
          <DialogHeader className="sr-only">
            <DialogTitle>Felicia's photo</DialogTitle>
            <DialogDescription>The photo Felicia sent you</DialogDescription>
          </DialogHeader>
          {lightbox && (
            <img
              src={lightbox}
              alt="Felicia"
              className="mx-auto max-h-[78vh] w-auto max-w-full rounded-xl object-contain"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* photo picker — stage the candidates, then choose which one she gets */}
      <Dialog
        open={pickerOpen}
        onOpenChange={(open) => {
          if (!open && !sendingPhoto) {
            setPickerOpen(false);
            clearStaged();
          }
        }}
      >
        <DialogContent
          className="max-w-xl gap-0 overflow-hidden border-border/60 bg-card/95 p-0 backdrop-blur-xl"
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(event) => {
            // Children fire their own dragleave as the cursor passes over them;
            // only dim when the pointer has genuinely left the dialog.
            if (
              !(event.relatedTarget instanceof Node) ||
              !event.currentTarget.contains(event.relatedTarget)
            ) {
              setDragOver(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            if (event.dataTransfer.files.length > 0) {
              addPhotos(event.dataTransfer.files);
            }
          }}
        >
          <DialogHeader className="border-b border-border/50 px-6 py-5">
            <DialogTitle className="font-display text-xl tracking-tight">
              Send Felicia a photo
            </DialogTitle>
            <DialogDescription>
              Pick the one you want — she gets only what you choose.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-5">
            {selectedPhoto ? (
              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-muted/30">
                  <motion.img
                    key={selectedPhoto.id}
                    src={selectedPhoto.url}
                    alt="The photo you picked"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    className="max-h-[42vh] min-h-32 w-full object-contain"
                  />
                  <span className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full border border-border/50 bg-background/85 px-2.5 py-1 text-[10px] tracking-widest uppercase backdrop-blur">
                    <Check className="size-3 text-primary" />
                    she receives this
                  </span>
                </div>

                <div className="max-h-36 overflow-y-auto pr-0.5">
                  <ul className="grid grid-cols-5 gap-2">
                    {staged.map((photo) => (
                      <li key={photo.id} className="relative">
                        <button
                          type="button"
                          onClick={() => setSelectedId(photo.id)}
                          aria-pressed={photo.id === selectedId}
                          className={cn(
                            "block aspect-square w-full overflow-hidden rounded-lg border transition-all duration-200",
                            photo.id === selectedId
                              ? "border-primary ring-2 ring-primary/40"
                              : "border-border/50 opacity-70 hover:border-border hover:opacity-100",
                          )}
                        >
                          <img
                            src={photo.url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </button>
                        <button
                          type="button"
                          aria-label="Remove this photo"
                          onClick={() => dropStaged(photo.id)}
                          className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-background/85 text-muted-foreground opacity-70 backdrop-blur transition-opacity hover:text-foreground hover:opacity-100 after:absolute after:-inset-1.5 after:content-['']"
                        >
                          <X className="size-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div
                className={cn(
                  "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center transition-colors duration-200",
                  dragOver
                    ? "border-primary bg-primary/10"
                    : "border-border/60 bg-muted/20",
                )}
              >
                <span className="flex size-12 items-center justify-center rounded-full border border-border/50 bg-background">
                  <Images className="size-5 text-primary" />
                </span>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Drop a photo here</p>
                  <p className="text-xs text-muted-foreground">
                    JPEG or PNG, up to 6 MB — she can see what's in it
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                >
                  Choose from device
                </Button>
              </div>
            )}
          </div>

          <DialogFooter className="items-center justify-between gap-3 border-t border-border/50 px-6 py-4 sm:justify-between">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => fileRef.current?.click()}
              >
                <Images className="size-3.5" />
                {staged.length > 0 ? "Add more" : "Choose photos"}
              </Button>
              {staged.length > 0 && (
                <span className="text-[11px] text-muted-foreground/70">
                  {staged.length} {staged.length === 1 ? "photo" : "photos"}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={sendingPhoto}
                onClick={() => {
                  setPickerOpen(false);
                  clearStaged();
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="lift-primary"
                disabled={!selectedPhoto || sendingPhoto}
                onClick={() => void sendSelectedPhoto()}
              >
                {sendingPhoto ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                {sendingPhoto ? "Sending…" : "Send to Felicia"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* call */}
      {callOpen && (
        <FeliciaCall
          greeting={greeting}
          initialNote={callError}
          video={callVideo}
          onClose={() => setCallOpen(false)}
        />
      )}

    </>
  );
}
