import { Button } from "@/components/ui/button";
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
import { FELICIA } from "@/lib/felicia";
import {
  FELICIA_APPEARANCE_DEFAULT,
  FELICIA_BACKGROUNDS,
  FELICIA_OUTFITS,
  FELICIA_LOOK,
  type FeliciaAppearance,
} from "@/lib/felicia";
import { FELICIA_GALLERY, type GalleryPhoto } from "@/lib/gallery";
import { DEVELOP_MS, preloadImage } from "@/lib/photo";
import { sleep } from "@/lib/voice";
import { useAction, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Clock,
  Images,
  Loader2,
  Palette,
  Sparkles,
} from "lucide-react";
import { useCallback, useState } from "react";
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

interface QueuedPhotoWithId extends QueueItem {
  id?: string;
}

export default function Album() {
  const navigate = useNavigate();
  const photos = useQuery(api.felicia.photos);
  const generatePhoto = useAction(api.felicia.generatePhoto);

  const [lightbox, setLightbox] = useState<string | null>(null);
  const [hiddenCount, setHiddenCount] = useState<number | null>(null);
  const [developing, setDeveloping] = useState(false);

  const [popupOpen, setPopupOpen] = useState(false);
  const [appearance, setAppearance] = useState<FeliciaAppearance>(
    FELICIA_APPEARANCE_DEFAULT,
  );
  const [appearOpen, setAppearOpen] = useState(false);

  const [queueOpen, setQueueOpen] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [cursor, setCursor] = useState(0);

  const allPhotos = photos ?? [];
  const ready = photos !== undefined;

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

  function appendQueueItem(scene: string) {
    setQueue((prev) => [...prev, { scene, createdAt: Date.now() }]);
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

  async function enqueueResolve(item: QueuedPhotoWithId) {
    if (!ready) return null;
    const startedAt = Date.now();
    setDeveloping(true);
    try {
      const result = await generatePhoto({ scene: resolveScene(item.scene) });
      const remaining = DEVELOP_MS - (Date.now() - startedAt);
      if (remaining > 0) await sleep(remaining);
      if (result.url) await preloadImage(result.url);
      return {
        ...item,
        url: result.url,
        id: item.id ?? undefined,
        createdAt: item.createdAt,
      };
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Felicia couldn't send that.",
      );
      return null;
    } finally {
      setDeveloping(false);
    }
  }

  function insertResultAfter(itemResult: QueuedPhotoWithId) {
    setQueue((prev) => {
      const index = prev.findIndex(
        (x) =>
          x.scene === itemResult.scene && x.createdAt === itemResult.createdAt,
      );
      if (index === -1) return [...prev, itemResult];
      const next = [...prev];
      next[index] = itemResult;
      return next;
    });
  }

  function requeue(index: number) {
    setQueue((prev) => {
      const item = prev[index];
      if (!item) return prev;
      const next = [...prev];
      next.splice(index, 1);
      next.unshift(item);
      if (index < cursor) setCursor((c) => Math.max(0, c - 1));
      return next;
    });
    setQueueOpen(true);
    setCursor(0);
  }

  function moveCursor(delta: number) {
    setCursor((c) => Math.max(0, Math.min(queue.length, c + delta)));
  }

  const currentQueueItem = cursor < queue.length ? queue[cursor] : null;
  const nextQueueItem = cursor + 1 < queue.length ? queue[cursor + 1] : null;
  const prevQueueItem =
    cursor - 1 >= 0 ? queue[cursor - 1] : null;

  const pendingCount = queue.length;
  const lastPhoto = allPhotos[0];

  const lightboxCaption =
    FELICIA_GALLERY.find((photo: GalleryPhoto) => photo.url === lightbox)
      ?.title ?? `${FELICIA.name}'s photo`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="border-b border-border/50 px-4 py-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-end justify-between gap-3">
          <div>
            <nav className="flex items-center gap-1 text-xs text-muted-foreground">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronLeft className="size-3.5" />
                back
              </button>
            </nav>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
              Her album
            </h1>
            <p className="text-sm text-muted-foreground">
              Her permanent gallery, plus every photo she has sent you, newest
              first.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {lastPhoto && (
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 touch-none"
                onClick={() => openScenePicker(lastPhoto.scene)}
                title="Generate the same scene again"
              >
                <Sparkles className="size-4" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 touch-none"
              onClick={() => setAppearOpen(true)}
              title="Choose how she photo looks"
            >
              <Palette className="size-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0 touch-none">
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
                <h2 className="font-display text-lg font-semibold tracking-tight">
                  Her gallery
                </h2>
                <p className="text-xs text-muted-foreground">
                  Kept permanently in the app — these never leave.
                </p>
              </div>
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] tracking-widest text-primary uppercase">
                {FELICIA_GALLERY.length} permanent
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {FELICIA_GALLERY.map((photo: GalleryPhoto) => (
                <motion.button
                  key={photo.id}
                  type="button"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  onClick={() => setLightbox(photo.url)}
                  className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card text-left"
                  title={photo.title}
                >
                  <img
                    src={photo.url}
                    alt={photo.title}
                    loading="lazy"
                    className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </motion.button>
              ))}
            </div>
          </section>

          <div className="mb-3 flex items-end justify-between gap-2">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              From her sessions
            </h2>
            <span className="text-xs text-muted-foreground">
              {allPhotos.length} {allPhotos.length === 1 ? "photo" : "photos"}
            </span>
          </div>

          {!ready ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 px-6 py-20 text-center">
              <Images className="size-6 text-muted-foreground" />
              <h2 className="mt-4 font-display text-xl">No new photos yet</h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Her permanent gallery is above. Ask her to send you something
                new — or tap the palette to choose how she looks before she
                does.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <Button
                  className="gap-2"
                  disabled={developing || !ready}
                  onClick={requestCurrent}
                >
                  <Camera className="size-4" />
                  Ask for one now
                </Button>

                <Button
                  variant="outline"
                  className="gap-2"
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
                <div className="flex aspect-square flex-col items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 p-4 text-center text-xs text-primary">
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

              {visible.map((photo: { _id: string; url?: string | null; createdAt: number; scene?: string | null }) => (
                <motion.button
                  key={photo._id}
                  type="button"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  onClick={() => photo.url && setLightbox(photo.url)}
                  className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card text-left"
                  title={photo.scene ?? undefined}
                >
                  <img
                    src={photo.url ?? ""}
                    alt={photo.scene ?? ""}
                    loading="lazy"
                    className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2.5 pt-8 pb-2 text-[10px] text-white/85">
                    {timeLabel(photo.createdAt)}
                  </span>
                </motion.button>
              ))}
            </div>
          )}

          {ready && (
            <p className="mt-8 text-center text-xs text-muted-foreground">
              {FELICIA_GALLERY.length} gallery photos are part of the app; new
              ones she sends are kept in your account only.
            </p>
          )}
        </div>
      </div>

      <Dialog
        open={lightbox !== null}
        onOpenChange={(open) => !open && setLightbox(null)}
      >
        <DialogContent className="max-w-3xl border-border/60 bg-card p-3">
          <DialogHeader className="sr-only">
            <DialogTitle>{lightboxCaption}</DialogTitle>
            <DialogDescription>A photo of Felicia</DialogDescription>
          </DialogHeader>
          {lightbox && (
            <img
              src={lightbox}
              alt="Felicia"
              className="max-h-[78vh] w-full rounded-xl object-contain"
            />
          )}
        </DialogContent>
      </Dialog>

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
                              if (item.url) setLightbox(item.url);
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
    </div>
  );
}
