import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { FELICIA } from "@/lib/felicia";
import {
  FELICIA_APPEARANCE_DEFAULT,
  FELICIA_BACKGROUNDS,
  FELICIA_OUTFITS,
  type FeliciaAppearance,
} from "@/lib/felicia";
import {
  FELICIA_GALLERY,
  galleryOriginal,
  type GalleryPhoto,
} from "@/lib/gallery";
import { DEVELOP_MS, preloadImage } from "@/lib/photo";
import { sleep } from "@/lib/voice";
import { useAction, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  Film,
  Images,
  Link,
  Loader2,
  Palette,
  Play,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function timeLabel(ms: number) {
  return new Date(ms).toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type QueueItem = {
  scene: string;
  createdAt: number;
  url?: string;
};

/** What the lightbox is currently showing, and what it can be used for. */
type LightboxPhoto = {
  url: string;
  title: string;
  /** Set when the picture is one of her permanent gallery photos. */
  galleryId?: string;
  /** Play it in a player instead of drawing it as a still. */
  video?: boolean;
};

/** One video the user added to her gallery. */
type GalleryVideo = {
  _id: string;
  title: string;
  url: string;
  createdAt: number;
};

/** Kept in step with MAX_VIDEO_BYTES in convex/videos.ts. */
const MAX_VIDEO_MB = 1024;

/**
 * POST a file to a Convex upload URL, reporting progress.
 *
 * `fetch` cannot report upload progress, and a 1 GB clip over a home
 * connection is exactly the case where a silent spinner reads as "broken".
 * A Convex upload URL has a two-minute server-side timeout, so that is also
 * reported in plain words instead of surfacing as a generic failure.
 */
const VIDEO_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  ogv: "video/ogg",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  "3gp": "video/3gpp",
};

/**
 * The type to upload the file as.
 *
 * Some browsers and OS combinations report an empty `type` for a perfectly
 * ordinary .mov or .mkv; posting it as `application/octet-stream` made the
 * server reject it as "not a video" after a finished upload, which is exactly
 * the kind of silent nothing the user then sees. The extension is the fallback.
 */
function videoContentType(file: File): string | null {
  if (file.type.startsWith("video/")) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_TYPES[extension] ?? null;
}

/** Her gallery takes clips up to five minutes; convex/videos.ts enforces it. */
const MAX_VIDEO_SECONDS = 300;

/**
 * Read a clip's length in the browser, before a byte is uploaded.
 *
 * The browser only knows a file's duration once it has parsed the container,
 * so this loads the metadata off a throwaway object URL. Some formats (a
 * handbraked .mkv, a screen recording) never report one — those come back as
 * null and the clip goes up anyway, because "unknown" is not "too long".
 */
function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const probe = document.createElement("video");
    const finish = (seconds: number | null) => {
      URL.revokeObjectURL(url);
      probe.removeAttribute("src");
      resolve(seconds);
    };
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      const seconds = probe.duration;
      finish(Number.isFinite(seconds) && seconds > 0 ? seconds : null);
    };
    probe.onerror = () => finish(null);
    // Give a slow parser a moment before writing the file off as unreadable.
    window.setTimeout(() => finish(null), 8000);
    probe.src = url;
  });
}

function uploadWithProgress(
  url: string,
  file: File,
  toastId: string | number,
  contentType: string,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.setRequestHeader("Content-Type", contentType);
    request.timeout = 120_000;

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
      toast.loading(`Uploading her video — ${percent}%`, { id: toastId });
    };

    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(`The upload failed (${request.status}). Try again.`));
        return;
      }
      try {
        const body = JSON.parse(request.responseText) as {
          storageId?: string;
        };
        if (!body.storageId) throw new Error("no storageId");
        resolve(body.storageId);
      } catch {
        reject(new Error("The upload finished without a file id. Try again."));
      }
    };
    request.onerror = () =>
      reject(
        new Error("The upload was interrupted — check your connection and try again."),
      );
    request.ontimeout = () =>
      reject(
        new Error(
          "The upload timed out. Convex only allows two minutes per upload, so a very large clip needs a fast connection — or trim it.",
        ),
      );

    request.send(file);
  });
}

interface QueuedPhotoWithId extends QueueItem {
  id?: string;
}

export default function Album() {
  const navigate = useNavigate();
  const photos = useQuery(api.felicia.photos);
  const generatePhoto = useAction(api.felicia.generatePhoto);
  const backfillPhotoVision = useAction(api.felicia.backfillPhotoVision);
  const profile = useQuery(api.feliciaAppearance.profile);
  const setProfilePhoto = useMutation(api.feliciaAppearance.setProfilePhoto);

  const videoRows = useQuery(api.videos.list);
  const generateVideoUploadUrl = useMutation(api.videos.generateUploadUrl);
  const saveVideo = useMutation(api.videos.save);
  const removeVideo = useMutation(api.videos.remove);
  const heroVideo = useQuery(api.videos.hero);
  const setHeroVideo = useMutation(api.videos.setHero);
  const clearHeroVideo = useMutation(api.videos.clearHero);

  const [lightbox, setLightbox] = useState<LightboxPhoto | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoToRemove, setVideoToRemove] = useState<GalleryVideo | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [hiddenCount, setHiddenCount] = useState<number | null>(null);
  const [developing, setDeveloping] = useState(false);

  const addFromLink = useAction(api.felicia.addFromLink);

  const [popupOpen, setPopupOpen] = useState(false);
  const [appearance, setAppearance] = useState<FeliciaAppearance>(
    FELICIA_APPEARANCE_DEFAULT,
  );
  const [appearOpen, setAppearOpen] = useState(false);

  const [queueOpen, setQueueOpen] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [cursor, setCursor] = useState(0);

  const [linkImportOpen, setLinkImportOpen] = useState(false);
  const [linkInput, setLinkInput] = useState(
    "https://photos.app.goo.gl/NzhhrykYjuoDiokU9",
  );
  const [importing, setImporting] = useState(false);

  const backfillStarted = useRef(false);

  const allPhotos = photos ?? [];
  const ready = photos !== undefined;

  // Her eyes, applied to the photos that were sent before she could see: on
  // opening the album she reads the older ones a few at a time, in the
  // background. Nothing to read returns instantly, and a failure here must
  // never interrupt the album, so it stays silent either way.
  useEffect(() => {
    if (!ready || backfillStarted.current) return;
    backfillStarted.current = true;
    void backfillPhotoVision({ limit: 10 }).catch(() => undefined);
  }, [backfillPhotoVision, ready]);

  const hidden = new Set<string>();
  if (hiddenCount !== null) {
    for (const photo of allPhotos.slice(
      0,
      Math.max(0, allPhotos.length - hiddenCount),
    )) {
      hidden.add(String(photo._id));
    }
  }

  const visible = allPhotos.filter((photo: { _id: unknown }) => !hidden.has(String(photo._id)));

  async function requestPhoto(scene: string) {
    if (!ready) return;
    const startedAt = Date.now();
    setHiddenCount(allPhotos.length);
    setDeveloping(true);
    try {
      const result = await generatePhoto({ scene });
      const remaining = DEVELOP_MS - (Date.now() - startedAt);
      if (remaining > 0) await sleep(remaining);
      if (result.url) await preloadImage(result.url);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Felicia couldn't send that.",
      );
    } finally {
      setDeveloping(false);
      setHiddenCount(null);
    }
  }

  function resolveScene(scene: string | undefined): string {
    if (!scene) {
      if (appearance.overrideScene) {
        return appearance.overrideScene;
      }
      const outfit = FELICIA_OUTFITS.find((o) => o.key === appearance.outfitKey);
      const background = FELICIA_BACKGROUNDS.find(
        (b) => b.key === appearance.backgroundKey,
      );
      return `portrait of Felicia, ${outfit?.sceneSuffix ?? ""} ${background?.sceneSuffix ?? ""} warm photoreal portrait light, candid, elegant`;
    }
    if (appearance.overrideScene) {
      return appearance.overrideScene;
    }
    const outfit = FELICIA_OUTFITS.find((o) => o.key === appearance.outfitKey);
    const background = FELICIA_BACKGROUNDS.find(
      (b) => b.key === appearance.backgroundKey,
    );
    return `portrait of Felicia, ${scene}, ${outfit?.sceneSuffix ?? ""} ${background?.sceneSuffix ?? ""} warm photoreal portrait light, candid, elegant`;
  }

  const requestCurrent: () => void = useCallback(() => {
    void requestPhoto(resolveScene(undefined));
  }, [requestPhoto, appearance]);

  function openScenePicker(scene: string | undefined) {
    if (scene === undefined || scene === appearance.overrideScene) {
      setAppearOpen(true);
    } else {
      void requestPhoto(scene);
    }
  }

  function populateQueue(scene: string) {
    setQueue((prev) => [
      ...prev,
      {
        scene,
        createdAt: Date.now(),
      },
    ]);
    setQueueOpen(true);
    setCursor(queue.length);
  }

  function dequeue() {
    if (queue.length === 0) return;
    const next = queue[0] ?? null;
    if (!next) return;
    setQueue((prev) => prev.slice(1));
    setCursor(Math.max(0, queue.length - 1));
    void requestPhoto(next.scene);
  }

  function dequeueAt(index: number) {
    setQueue((prev) => prev.filter((_: QueueItem, i: number) => i !== index));
    if (index < cursor) {
      setCursor(Math.max(0, cursor - 1));
    }
  }

  function moveCursor(delta: number) {
    setCursor((c) => Math.max(0, Math.min(queue.length, c + delta)));
  }

  const pendingCount = queue.length;
  const lastPhoto = allPhotos[0];
  /** Which gallery photo is her profile picture right now, if any. */
  const avatarGalleryId = profile?.avatarGalleryId ?? null;
  const videos = (videoRows ?? []) as GalleryVideo[];

  async function chooseAsProfile(photo: GalleryPhoto) {
    try {
      await setProfilePhoto({ galleryId: photo.id });
      toast.success("That's her face now.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't set her profile picture.",
      );
    }
  }

  /**
   * Put a video from this device into her gallery.
   *
   * Three steps, the Convex way: ask for a one-hour upload URL, POST the file
   * straight to it, then hand the storage id to the mutation that files it in
   * the album. The type and size are checked here first so a wrong pick costs
   * nothing, and again on the server so it is actually enforced.
   */
  async function addVideo(file: File) {
    const contentType = videoContentType(file);
    if (!contentType) {
      toast.error("That file isn't a video. Pick an MP4, MOV or WebM.");
      return;
    }
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      toast.error(
        `That video is ${Math.round(file.size / 1024 / 1024)} MB — keep it under 1 GB.`,
      );
      return;
    }

    // Read the length before uploading, so an over-long clip is refused in a
    // second rather than after a long upload and a server rejection.
    const duration = await readVideoDuration(file);
    if (duration !== null && duration > MAX_VIDEO_SECONDS + 15) {
      const minutes = Math.floor(duration / 60);
      const seconds = Math.round(duration % 60);
      toast.error(
        `That clip runs ${minutes}:${String(seconds).padStart(2, "0")} — her gallery takes videos up to 5 minutes.`,
      );
      return;
    }

    setUploadingVideo(true);
    const toastId = toast.loading("Adding your video to her gallery…");
    try {
      const postUrl = await generateVideoUploadUrl({});
      const storageId = await uploadWithProgress(
        postUrl,
        file,
        toastId,
        contentType,
      );
      const title =
        file.name
          .replace(/\.[^.]+$/, "")
          .replace(/[_-]+/g, " ")
          .trim()
          .slice(0, 80) || "Her video";

      await saveVideo({
        storageId: storageId as Id<"_storage">,
        title,
        // Unknown durations upload as before; the server only enforces what
        // the browser actually measured.
        durationSeconds: duration ?? undefined,
      });
      toast.success("She has it in her gallery now.", { id: toastId });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "That video didn't upload.",
        { id: toastId },
      );
    } finally {
      setUploadingVideo(false);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  }

  async function importFromLink() {
    if (!linkInput.trim()) return;
    setImporting(true);
    const toastId = toast.loading("Opening the link…");
    try {
      const { photos: addedPhotos, videos: addedVideos } = await addFromLink({
        link: linkInput.trim(),
      });
      const what =
        addedVideos > 0
          ? `${addedVideos} video${addedVideos === 1 ? "" : "s"}`
          : `${addedPhotos} photo${addedPhotos === 1 ? "" : "s"}`;
      toast.success(`Added ${what} to her gallery.`, { id: toastId });
      setLinkImportOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't import from that link.",
        { id: toastId },
      );
    } finally {
      setImporting(false);
    }
  }

  /**
   * Choose the clip her camera plays by itself.
   *
   * One clip at a time: tapping the one already playing puts her back on the
   * still picture her camera used before videos existed.
   */
  async function chooseHeroVideo(video: GalleryVideo) {
    const active = heroVideo?._id === video._id;
    try {
      if (active) {
        await clearHeroVideo({});
        toast.success("Her camera uses a picture again.");
      } else {
        await setHeroVideo({ id: video._id as Id<"galleryVideos"> });
        toast.success(`“${video.title}” now plays on her camera.`);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't change her camera.",
      );
    }
  }

  async function confirmRemoveVideo() {
    const video = videoToRemove;
    if (!video) return;
    setVideoToRemove(null);
    try {
      await removeVideo({ id: video._id as Id<"galleryVideos"> });
      toast.success("Removed from her gallery.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't remove that video.",
      );
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="glass sticky top-0 z-20 rounded-none border-x-0 border-t-0 px-4 py-4 sm:rounded-b-3xl sm:border-x sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-end justify-between gap-3">
          <div>
            <nav className="flex items-center gap-1 text-xs text-muted-foreground">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronLeft className="size-3.5" />
                back
              </button>
            </nav>
            <h1 className="mt-1 font-display text-3xl tracking-tight">
              Her album
            </h1>
            <p className="text-sm text-muted-foreground">
              Her permanent gallery, plus every photo she has sent you, newest
              first.
            </p>
          </div>

          <div className="flex items-center gap-1">
            {lastPhoto && (
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 touch-none rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary"
                onClick={() => openScenePicker(lastPhoto.scene)}
                title="Generate the same scene again"
              >
                <Sparkles className="size-4" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 touch-none rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary"
              onClick={() => setAppearOpen(true)}
              title="Choose how she photo looks"
            >
              <Palette className="size-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 touch-none rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary"
                >
                  <Clock className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Queue</DropdownMenuLabel>
                {queue.length === 0 ? (
                  <DropdownMenuItem disabled className="text-muted-foreground">
                    No pending photos
                  </DropdownMenuItem>
                ) : (
                  <>
                    <DropdownMenuItem onSelect={() => setQueueOpen(true)}>
                      <Clock className="size-4" />
                      Open queue ({pendingCount})
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={developing || queue.length === 0}
                      onSelect={() => dequeue()}
                    >
                      Generate next in queue
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <span className="text-xs text-muted-foreground">
              {allPhotos.length + FELICIA_GALLERY.length} photos
              {videos.length > 0 &&
                ` · ${videos.length} video${videos.length === 1 ? "" : "s"}`}
            </span>

            <Button
              size="sm"
              className="gap-2"
              disabled={developing || !ready}
              onClick={requestCurrent}
            >
              {developing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              Ask for one
            </Button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto w-full max-w-5xl">
          {/* Her gallery — shipped with the app, so it is always here. */}
          <section className="mb-8" aria-label="Her permanent gallery">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="font-display text-2xl tracking-tight">
                  Her gallery
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Kept permanently in the app — these never leave. Tap the star
                  on any of them to make it her profile picture, or just ask her
                  in the chat and she sends the one that fits. Videos you add
                  live here too.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void addVideo(file);
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 rounded-full"
                  disabled={uploadingVideo}
                  title="Add a clip from this device — up to 5 minutes, under 1 GB"
                  onClick={() => videoInputRef.current?.click()}
                >
                  {uploadingVideo ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Film className="size-3.5" />
                  )}
                  Add video
                  <span className="hidden text-[10px] tracking-wide text-muted-foreground sm:inline">
                    · 10 min
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 rounded-full text-primary"
                  onClick={() => setLinkImportOpen(true)}
                  title="Add a photo or video from a public Google Photos link"
                >
                  <Link className="size-3.5" />
                  Add from link
                </Button>
                <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] tracking-widest text-primary uppercase">
                  {FELICIA_GALLERY.length} permanent
                  {videos.length > 0 && ` · ${videos.length} video`}
                  {videos.length > 1 && "s"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {FELICIA_GALLERY.map((photo: GalleryPhoto) => {
                const isAvatar = avatarGalleryId === photo.id;
                return (
                  <motion.div
                    key={photo.id}
                    initial={{ opacity: 0, scale: 0.96 }}
                    whileHover={{ y: -4 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                    className={cn(
                      "group relative overflow-hidden rounded-2xl surface transition-shadow duration-300 hover:shadow-[0_26px_55px_-34px_var(--foreground)]",
                      isAvatar && "ring-2 ring-primary/70 ring-offset-2 ring-offset-background",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setLightbox({
                          url: photo.fullUrl,
                          title: photo.title,
                          galleryId: photo.id,
                        })
                      }
                      className="block w-full text-left"
                      title={photo.title}
                    >
                      <img
                        src={photo.url}
                        alt={photo.title}
                        loading="lazy"
                        decoding="async"
                        className="aspect-[2/3] w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </button>

                    {/* Always visible: there is no hover on a phone, and this is
                        the only way to choose her face. */}
                    <button
                      type="button"
                      onClick={() => void chooseAsProfile(photo)}
                      title={
                        isAvatar
                          ? "This is her profile picture"
                          : "Use as her profile picture"
                      }
                      aria-label={
                        isAvatar
                          ? `Her profile picture is ${photo.title}`
                          : `Use ${photo.title} as her profile picture`
                      }
                      className={cn(
                        "absolute top-2 right-2 flex size-8 items-center justify-center rounded-full border backdrop-blur-md transition-colors",
                        isAvatar
                          ? "border-primary/50 bg-primary text-primary-foreground"
                          : "border-white/25 bg-black/40 text-white/85 hover:bg-black/60 hover:text-white",
                      )}
                    >
                      {isAvatar ? (
                        <Check className="size-3.5" />
                      ) : (
                        <Star className="size-3.5" />
                      )}
                    </button>

                    <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pt-10 pb-3 text-[11px] font-medium text-white/90 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                      {photo.title}
                    </span>
                  </motion.div>
                );
              })}

              {videos.map((video) => (
                <motion.div
                  key={video._id}
                  initial={{ opacity: 0, scale: 0.96 }}
                  whileHover={{ y: -4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  className="group relative overflow-hidden rounded-2xl surface transition-shadow duration-300 hover:shadow-[0_26px_55px_-34px_var(--foreground)]"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setLightbox({
                        url: video.url,
                        title: video.title,
                        video: true,
                      })
                    }
                    className="block w-full text-left"
                    title={video.title}
                  >
                    <video
                      /* The `#t=0.1` fragment asks the browser for a frame a
                         little way in, so the tile shows her picture instead of
                         a black rectangle on browsers that don't paint the
                         first frame on their own. */
                      src={`${video.url}#t=0.1`}
                      muted
                      playsInline
                      preload="metadata"
                      /* The clip her camera plays runs here too, so the choice
                         is visible in the gallery itself. */
                      autoPlay={heroVideo?._id === video._id}
                      loop={heroVideo?._id === video._id}
                      className="pointer-events-none aspect-[2/3] w-full bg-black object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <span className="flex size-12 items-center justify-center rounded-full border border-white/30 bg-black/45 text-white backdrop-blur-md transition-transform duration-300 group-hover:scale-110">
                        <Play className="size-5 fill-current" />
                      </span>
                    </span>
                  </button>

                  {/* Her camera is one clip or her picture — so this is a
                      choice, not a queue. Tapping the playing clip turns it
                      off again. */}
                  <button
                    type="button"
                    onClick={() => void chooseHeroVideo(video)}
                    title={
                      heroVideo?._id === video._id
                        ? "Her camera plays this clip — tap to use her picture again"
                        : "Auto-play this clip on her camera feed"
                    }
                    aria-label={
                      heroVideo?._id === video._id
                        ? `Her camera plays ${video.title}`
                        : `Auto-play ${video.title} on her camera feed`
                    }
                    className={cn(
                      "absolute top-2 left-2 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium backdrop-blur-md transition-colors",
                      heroVideo?._id === video._id
                        ? "border-primary/50 bg-primary text-primary-foreground"
                        : "border-white/25 bg-black/40 text-white/85 hover:bg-black/60 hover:text-white",
                    )}
                  >
                    {heroVideo?._id === video._id ? (
                      <Check className="size-3" />
                    ) : (
                      <Play className="size-3 fill-current" />
                    )}
                    {heroVideo?._id === video._id ? "On camera" : "Auto-play"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setVideoToRemove(video)}
                    title="Remove from her gallery"
                    aria-label={`Remove ${video.title} from her gallery`}
                    className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full border border-white/25 bg-black/40 text-white/85 backdrop-blur-md transition-colors hover:bg-black/60 hover:text-white"
                  >
                    <Trash2 className="size-3.5" />
                  </button>

                  <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pt-10 pb-3 text-[11px] font-medium text-white/90">
                    {video.title}
                  </span>
                </motion.div>
              ))}
            </div>
          </section>

          <div className="mb-3 flex items-end justify-between gap-2">
            <h2 className="font-display text-2xl tracking-tight">
              From her sessions
            </h2>
            <span className="rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs text-muted-foreground">
              {allPhotos.length} {allPhotos.length === 1 ? "photo" : "photos"}
            </span>
          </div>

          {!ready ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : visible.length === 0 ? (
            <div className="surface flex flex-col items-center justify-center rounded-3xl border-dashed px-6 py-20 text-center">
              <div className="glow-warm flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Images className="size-6" />
              </div>
              <h2 className="mt-4 font-display text-2xl tracking-tight">
                No new photos yet
              </h2>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Her permanent gallery is above. Ask her to send you something
                new — or tap the palette to choose how she looks before she
                does.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                <Button
                  className="lift-primary gap-2 rounded-full"
                  disabled={developing || !ready}
                  onClick={requestCurrent}
                >
                  <Camera className="size-4" />
                  Ask for one now
                </Button>

                <Button
                  variant="outline"
                  className="gap-2 rounded-full"
                  disabled={developing || !ready}
                  onClick={() => setPopupOpen(true)}
                >
                  <Palette className="size-4" />
                  Ask in a specific look
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {developing && (
                <div className="flex aspect-[2/3] flex-col items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 p-4 text-center text-xs text-primary">
                  <Camera className="size-5 animate-pulse" />
                  <p className="mt-2">developing…</p>
                  <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-primary/20">
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
              )}

              {visible.map((photo: { _id: string; url?: string | null; galleryId?: string | null; createdAt: number; scene?: string | null }) => (
                <motion.button
                  key={photo._id}
                  type="button"
                  initial={{ opacity: 0, scale: 0.96 }}
                  whileHover={{ y: -4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  onClick={() =>
                    photo.url &&
                    setLightbox({
                      // The grid draws the small tile; opening it shows the
                      // original upload, which is what the full-size frame
                      // needs to stay sharp.
                      url: galleryOriginal(photo.galleryId) ?? photo.url,
                      title: photo.scene ?? `${FELICIA.name}'s photo`,
                    })
                  }
                  className="group relative overflow-hidden rounded-3xl surface text-left"
                  title={photo.scene ?? undefined}
                >
                  <img
                    src={photo.url ?? ""}
                    alt={photo.scene ?? ""}
                    decoding="async"
                    loading="lazy"
                    className="aspect-[2/3] w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pt-8 pb-2.5 text-[10px] tracking-wide text-white/85">
                    {timeLabel(photo.createdAt)}
                  </span>
                </motion.button>
              ))}
            </div>
          )}

          {ready && (
            <p className="mt-8 text-center text-xs text-muted-foreground">
              {FELICIA_GALLERY.length} gallery photos are part of the app; new
              ones she sends and any videos you add are kept in your account
              only.
            </p>
          )}
        </div>
      </div>

      <Dialog
        open={lightbox !== null}
        onOpenChange={(open) => !open && setLightbox(null)}
      >
        <DialogContent className="max-w-3xl overflow-hidden border-border/60 bg-card/95 p-3 backdrop-blur-xl">
          <DialogHeader className="sr-only">
            <DialogTitle>{lightbox?.title ?? `${FELICIA.name}'s photo`}</DialogTitle>
            <DialogDescription>
              {lightbox?.video ? "A video in her gallery" : "A photo of Felicia"}
            </DialogDescription>
          </DialogHeader>
          {lightbox &&
            (lightbox.video ? (
              <video
                src={lightbox.url}
                controls
                autoPlay
                loop
                playsInline
                onError={() =>
                  toast.error(
                    "This browser can't play that file. An MP4 (H.264) always will.",
                  )
                }
                className="max-h-[72vh] w-full rounded-2xl bg-black object-contain"
              />
            ) : (
              <img
                src={lightbox.url}
                alt={lightbox.title}
                className="max-h-[72vh] w-full rounded-2xl object-contain"
              />
            ))}
          {lightbox && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-1 pb-1">
              <p className="text-xs text-muted-foreground">{lightbox.title}</p>
              {lightbox.galleryId &&
                (avatarGalleryId === lightbox.galleryId ? (
                  <span className="flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 text-[11px] text-primary">
                    <Check className="size-3.5" />
                    her profile picture
                  </span>
                ) : (
                  <Button
                    size="sm"
                    className="gap-1.5 rounded-full text-xs"
                    onClick={() => {
                      const id = lightbox.galleryId;
                      const photo = FELICIA_GALLERY.find(
                        (candidate: GalleryPhoto) => candidate.id === id,
                      );
                      if (photo) void chooseAsProfile(photo);
                    }}
                  >
                    <Star className="size-3.5" />
                    Use as her profile picture
                  </Button>
                ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={videoToRemove !== null}
        onOpenChange={(open) => !open && setVideoToRemove(null)}
      >
        <AlertDialogContent className="border-border/60 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this video?</AlertDialogTitle>
            <AlertDialogDescription>
              "{videoToRemove?.title}" comes out of her gallery, and the file is
              deleted with it. You can always add it again from your device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmRemoveVideo()}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={appearOpen} onOpenChange={setAppearOpen}>
        <DialogContent className="max-w-lg border-border/60 bg-card max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              Ask her for a photo, in a specific look
            </DialogTitle>
            <DialogDescription>
              Choose outfit and setting, then ask for the photo. Or pick a scene
              from the ones she already sent.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-4">
            <div>
              <label className="text-[10px] tracking-widest text-muted-foreground/70 uppercase">
                Outfit
              </label>
              <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                {FELICIA_OUTFITS.map((outfit) => (
                  <button
                    key={outfit.key}
                    type="button"
                    onClick={() =>
                      setAppearance((prev) => ({
                        ...prev,
                        outfitKey: outfit.key,
                      }))
                    }
                    className={cn(
                      "rounded-xl border px-3 py-3 text-left text-sm transition-colors",
                      appearance.outfitKey === outfit.key
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/60 bg-background/40 text-foreground hover:border-primary/50",
                    )}
                  >
                    <span className="font-medium">{outfit.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] tracking-widest text-muted-foreground/70 uppercase">
                Setting
              </label>
              <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                {FELICIA_BACKGROUNDS.map((background) => (
                  <button
                    key={background.key}
                    type="button"
                    onClick={() =>
                      setAppearance((prev) => ({
                        ...prev,
                        backgroundKey: background.key,
                      }))
                    }
                    className={cn(
                      "rounded-xl border px-3 py-3 text-left text-sm transition-colors",
                      appearance.backgroundKey === background.key
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/60 bg-background/40 text-foreground hover:border-primary/50",
                    )}
                  >
                    <span className="font-medium">{background.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] tracking-widest text-muted-foreground/70 uppercase">
                Free-text scene
              </label>
              <input
                type="text"
                value={appearance.overrideScene ?? ""}
                onChange={(event) =>
                  setAppearance((prev) => ({
                    ...prev,
                    overrideScene:
                      event.target.value.trim() || null,
                  }))
                }
                placeholder="e.g. on a rooftop at sunset, wind in her hair"
                className="mt-1.5 w-full rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button
              className="gap-2 flex-1"
              disabled={developing || !ready}
              onClick={() => {
                setAppearOpen(false);
                void requestPhoto(resolveScene(undefined));
              }}
            >
              <Sparkles className="size-3.5" />
              Ask for this photo
            </Button>
          </div>

          <Button
            variant="ghost"
            className="mt-2 w-full"
            onClick={() => {
              setAppearOpen(false);
              setPopupOpen(true);
            }}
          >
            or choose from an existing scene
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={popupOpen} onOpenChange={setPopupOpen}>
        <DialogContent className="max-w-xl border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              Which scene should she send?
            </DialogTitle>
            <DialogDescription>
              Pick from the photos she has already sent, or type your own scene
              text. You can queue several in a row.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[10px] tracking-widest text-muted-foreground/70 uppercase">
                From her album
              </h3>
              {lastPhoto && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs"                    disabled={developing || !ready}
                  onClick={() =>
                    populateQueue(lastPhoto.scene ?? "close-up portrait of Felicia, warm focused light")
                  }
                >
                  <Sparkles className="size-3" />
                  Use last one
                </Button>
              )}
            </div>

            {allPhotos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No photos yet. Ask her for one to start.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {allPhotos.slice(0, 8).map((photo: { _id: string; scene?: string | null; url?: string | null; createdAt: number }) => (
                  <button
                    key={photo._id}
                    type="button"
                    onClick={() =>
                      populateQueue(photo.scene ?? "close-up portrait of Felicia, warm focused light")
                    }
                    className="group flex cursor-pointer gap-3 rounded-xl border border-border/60 bg-background/40 p-2 transition-colors hover:border-primary/50"
                  >
                    {photo.url && (
                      <img
                        src={photo.url}
                        alt={photo.scene ?? undefined}
                        loading="lazy"
                        className="size-12 shrink-0 rounded-lg object-cover"
                      />
                    )}
                    <div className="flex min-w-0 flex-col">
                      <p className="truncate text-xs text-foreground">
                        {photo.scene ?? "Untitled"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {timeLabel(photo.createdAt)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4">
            <label className="text-[10px] tracking-widest text-muted-foreground/70 uppercase">
              Or write your own scene
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                type="text"
                className="flex-1 rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Describe the photo she should send"
              />
              <Button
                className="gap-2"
                disabled={developing || !ready}
                onClick={() => {
                  const input = document.querySelector<HTMLInputElement>(
                    "input[type='text']",
                  );
                  const value = input?.value.trim();
                  if (!value) return;
                  populateQueue(value);
                  if (input) input.value = "";
                }}
              >
                <Sparkles className="size-3.5" />
                Queue it
              </Button>
            </div>
          </div>

          <Button
            variant="ghost"
            className="mt-4 w-full"
            onClick={() => {
              setPopupOpen(false);
              setAppearOpen(true);
            }}
          >
            or use the appearance picker instead
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={queueOpen} onOpenChange={setQueueOpen}>
        <DialogContent className="max-w-xl border-border/60 bg-card max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              Photo generation queue
            </DialogTitle>
            <DialogDescription>
              Manage the photos she is about to generate for you. Each one waits
              its turn, then appears in the album when ready.
            </DialogDescription>
          </DialogHeader>

          {queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Clock className="size-6 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                No photos in the queue. Ask for one from the album or the
                appearance picker.
              </p>
            </div>
          ) : (
            <div className="mt-2 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] tracking-widest text-muted-foreground/70 uppercase">
                  {queue.length} pending
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 touch-none"
                    onClick={() => moveCursor(-1)}
                    disabled={cursor === 0}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    {cursor + 1} / {queue.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 touch-none"
                    onClick={() => moveCursor(1)}
                    disabled={cursor >= queue.length - 1}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {queue.map((item: QueuedPhotoWithId, index: number) => {
                  const isActive = index === cursor;
                  const isDone = item.url !== undefined;
                  return (
                    <div
                      key={`${item.scene}-${item.createdAt}`}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-colors",
                        isActive
                          ? "border-primary bg-primary/10"
                          : "border-border/60 bg-background/40",
                        isDone && "border-primary/40 bg-primary/5",
                      )}
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <p className="flex min-w-0 flex-1 flex-col text-sm">
                          <span className="truncate font-medium text-foreground">
                            {item.scene}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {timeLabel(item.createdAt)}
                          </span>
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          {isDone ? (
                            <span className="flex items-center gap-1 text-[10px] text-primary">
                              <Sparkles className="size-3" />
                              ready
                            </span>
                          ) : isActive ? (
                            <span className="flex items-center gap-1 text-[10px] text-primary">
                              <Loader2 className="size-3 animate-spin" />
                              next
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">
                              waiting
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 touch-none"
                          onClick={() => {
                            if (queue.length > 1) {
                              dequeueAt(index);
                            } else {
                              dequeue();
                            }
                          }}
                          disabled={developing || queue.length === 1 || isActive}
                          title="Remove from queue"
                        >
                          <Camera className="size-4" />
                        </Button>

                        {isActive && !isDone && (
                          <Button
                            size="sm"
                            className="gap-1.5 text-xs"
                            disabled={developing}
                            onClick={() => dequeue()}
                          >
                            <Sparkles className="size-3" />
                            Generate now
                          </Button>
                        )}

                        {!isActive && !isDone && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-xs"
                            disabled={developing}
                            onClick={() => {
                              setCursor(index);
                              setQueueOpen(true);
                            }}
                          >
                            <Clock className="size-3" />
                            Move to front
                          </Button>
                        )}
                        {isDone && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0 touch-none"
                            disabled={!item.url}
                            onClick={() => {
                              if (item.url) {
                                setLightbox({
                                  url: item.url,
                                  title: item.scene,
                                });
                              }
                            }}
                            title="View this photo"
                          >
                            <Images className="size-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  className="gap-1.5 flex-1 text-xs"
                  disabled={developing || queue.length === 0}
                  onClick={() => dequeue()}
                >
                  <Sparkles className="size-3" />
                  Generate next in queue
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 text-xs"
                  disabled={developing || queue.length === 0}
                  onClick={() => {
                    setQueueOpen(false);
                    requestCurrent();
                  }}
                >
                  Ask for a new photo instead
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={linkImportOpen}
        onOpenChange={(open) => {
          if (!importing) setLinkImportOpen(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Add from a link</DialogTitle>
            <DialogDescription>
              Paste a public Google Photos share link. A shared video is copied
              straight into her gallery to play; a shared album's photos land
              in her roll beside the rest of her pictures.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              value={linkInput}
              onChange={(event) => setLinkInput(event.target.value)}
              placeholder="https://photos.app.goo.gl/…"
              disabled={importing}
              autoFocus
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Anyone-with-the-link only — a private link can't be read. Single
              items always come through; a full album usually only exposes the
              photos Google embeds in the page.
            </p>
            <Button
              className="w-full gap-2"
              disabled={importing || !linkInput.trim()}
              onClick={() => void importFromLink()}
            >
              {importing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Cloud className="size-4" />
              )}
              {importing ? "Adding…" : "Add to her gallery"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
