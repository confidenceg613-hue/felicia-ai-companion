import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import { FELICIA } from "@/lib/felicia";
import { DEVELOP_MS, preloadImage } from "@/lib/photo";
import { sleep } from "@/lib/voice";
import { useAction, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Camera, Images, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function timeLabel(ms: number) {
  return new Date(ms).toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Her album — every photo she has sent, in one place.
 *
 * The generation follows the same reveal rule as the conversation: the new
 * picture is held back until it has finished, decoded and aged past the develop
 * delay, so nothing ever appears half-rendered here either.
 */
export default function Album() {
  const photos = useQuery(api.felicia.photos);
  const generatePhoto = useAction(api.felicia.generatePhoto);

  const [lightbox, setLightbox] = useState<string | null>(null);
  const [hiddenCount, setHiddenCount] = useState<number | null>(null);
  const [developing, setDeveloping] = useState(false);

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
  const visible = allPhotos.filter((photo) => !hidden.has(String(photo._id)));

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
        error instanceof Error ? error.message : "She couldn't send that.",
      );
    } finally {
      setDeveloping(false);
      setHiddenCount(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="border-b border-border/50 px-4 py-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              Her album
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every photo Felicia has sent you, newest first.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {allPhotos.length} photos
            </span>
            <Button
              size="sm"
              className="gap-2"
              disabled={developing || !ready}
              onClick={() =>
                void requestPhoto(
                  "somewhere she has just arrived, warm evening light, candid",
                )
              }
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
          {!ready ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 px-6 py-20 text-center">
              <Images className="size-6 text-muted-foreground" />
              <h2 className="mt-4 font-display text-xl">Nothing here yet</h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Ask Felicia to send you something — or tap the camera in the
                conversation and she'll take a selfie.
              </p>
              <Button
                className="mt-5 gap-2"
                disabled={developing}
                onClick={() =>
                  void requestPhoto(
                    "on a sunlit balcony at golden hour, wearing a soft linen shirt, relaxed",
                  )
                }
              >
                <Camera className="size-4" />
                Ask for a photo
              </Button>
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

              {visible.map((photo) => (
                <motion.button
                  key={photo._id}
                  type="button"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  onClick={() => photo.url && setLightbox(photo.url)}
                  className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card text-left"
                  title={photo.scene}
                >
                  <img
                    src={photo.url ?? ""}
                    alt={photo.scene}
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

          {ready && allPhotos.length > 0 && (
            <p className="mt-6 text-center text-xs text-muted-foreground">
              Generated with Cloudflare Workers AI · kept in your account only.
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
            <DialogTitle>{FELICIA.name}'s photo</DialogTitle>
            <DialogDescription>A photo Felicia sent you</DialogDescription>
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
    </div>
  );
}
