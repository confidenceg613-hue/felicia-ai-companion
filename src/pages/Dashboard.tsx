import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { FELICIA } from "@/lib/felicia";
import { cn } from "@/lib/utils";
import { useAction, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Camera,
  ImagePlus,
  Loader2,
  LogOut,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

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

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const messages = useQuery(api.felicia.messages);
  const photos = useQuery(api.felicia.photos);
  const connection = useQuery(api.felicia.connectorStatus);
  const clearConversation = useMutation(api.felicia.clearConversation);
  const sendMessage = useAction(api.felicia.sendMessage);
  const generatePhoto = useAction(api.felicia.generatePhoto);

  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  const list = messages ?? [];
  const lastUserMessage = [...list].reverse().find((m) => m.role === "user");
  const showPending = pending !== null && lastUserMessage?.content !== pending;
  const busy = thinking || generating !== null;

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [list.length, showPending, generating]);

  async function requestPhoto(scene: string) {
    setGenerating("a new photo");
    try {
      await generatePhoto({ scene });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Felicia couldn't send that photo.",
      );
    } finally {
      setGenerating(null);
    }
  }

  async function handleSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    setDraft("");
    setPending(trimmed);
    setThinking(true);

    try {
      const result = await sendMessage({ text: trimmed });
      setPending(null);
      setThinking(false);
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
    <main className="relative min-h-screen bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-96 overflow-hidden"
      >
        <div className="absolute -top-32 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-primary/10 blur-[130px]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        {/* ----------------------------------------------------------- header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <img
                src="/felicia/hero.jpg"
                alt={FELICIA.name}
                className="size-14 rounded-2xl border border-border/60 object-cover"
              />
              <span className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-2 border-background bg-emerald-400" />
            </div>
            <div>
              <h1 className="font-display text-2xl leading-tight font-semibold tracking-tight">
                {FELICIA.fullName}
              </h1>
              <p className="text-sm text-muted-foreground">
                {FELICIA.city} · online
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground"
              onClick={handleClear}
              disabled={busy || list.length === 0}
            >
              <Trash2 className="size-4" />
              <span className="hidden sm:inline">Clear</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleSignOut}
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </header>

        {/* ------------------------------------------------------- config note */}
        {connection && !connection.configured && (
          <div className="rounded-2xl border border-primary/40 bg-primary/10 p-4 text-sm">
            <p className="font-medium text-primary">
              Cloudflare Workers AI isn't connected
            </p>
            <p className="mt-1 text-muted-foreground">
              Add{" "}
              <code className="rounded bg-background/60 px-1.5 py-0.5">
                CLOUDFLARE_API_TOKEN
              </code>{" "}
              and{" "}
              <code className="rounded bg-background/60 px-1.5 py-0.5">
                CLOUDFLARE_ACCOUNT_ID
              </code>{" "}
              in your project's Keys settings so Felicia can reply and send
              photos.
            </p>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          {/* ---------------------------------------------------------- chat */}
          <section className="flex h-[70vh] min-h-[30rem] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card">
            <div
              ref={scrollRef}
              className="flex-1 space-y-4 overflow-y-auto p-5"
            >
              {list.length === 0 && !showPending && (
                <div className="flex h-full flex-col items-center justify-center px-4 text-center">
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
                        onClick={() => void handleSend(opener)}
                        className="rounded-full border border-border/60 bg-background/40 px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                      >
                        {opener}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {list.map((message) => (
                <motion.div
                  key={message._id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className={cn(
                    "flex",
                    message.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                      message.role === "user"
                        ? "rounded-br-md bg-primary text-primary-foreground"
                        : "rounded-bl-md bg-secondary text-secondary-foreground",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    <p
                      className={cn(
                        "mt-1 text-[10px]",
                        message.role === "user"
                          ? "text-primary-foreground/60"
                          : "text-muted-foreground/70",
                      )}
                    >
                      {timeLabel(message.createdAt)}
                    </p>
                  </div>
                </motion.div>
              ))}

              {showPending && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/70 px-4 py-2.5 text-sm text-primary-foreground">
                    <p className="whitespace-pre-wrap">{pending}</p>
                  </div>
                </div>
              )}

              {thinking && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-secondary px-4 py-3">
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

              {generating && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2.5 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-xs text-primary">
                    <Camera className="size-4 animate-pulse" />
                    Felicia is taking a photo…
                  </div>
                </div>
              )}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleSend(draft);
              }}
              className="border-t border-border/60 bg-background/40 p-4"
            >
              <div className="flex items-end gap-2">
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
                  disabled={busy}
                  className="max-h-32 min-h-11 resize-none"
                />
                <Button
                  type="submit"
                  size="icon"
                  className="size-11 shrink-0"
                  disabled={busy || !draft.trim()}
                >
                  {thinking ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Enter to send · Shift + Enter for a new line
              </p>
            </form>
          </section>

          {/* -------------------------------------------------------- photos */}
          <section className="flex flex-col gap-4">
            <div className="rounded-2xl border border-border/60 bg-card p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg">Ask for a photo</h2>
                <Badge
                  variant="outline"
                  className="border-primary/40 text-[10px] text-primary"
                >
                  {photos?.length ?? 0} sent
                </Badge>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                She'll tell you where she is, then send the picture.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="gap-2"
                  disabled={busy}
                  onClick={() =>
                    void requestPhoto(
                      "somewhere she has just arrived, warm evening light, candid",
                    )
                  }
                >
                  {generating ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ImagePlus className="size-3.5" />
                  )}
                  Surprise me
                </Button>
                {FELICIA.scenes.map((scene) => (
                  <button
                    key={scene.label}
                    type="button"
                    disabled={busy}
                    onClick={() => void requestPhoto(scene.scene)}
                    className="rounded-full border border-border/60 bg-background/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
                  >
                    {scene.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card p-5">
              <h2 className="font-display text-lg">Her photos</h2>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Everything she's sent you, newest first.
              </p>

              {photos === undefined ? (
                <div className="mt-4 flex h-32 items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : photos.length === 0 ? (
                <div className="mt-4 flex flex-col items-center rounded-xl border border-dashed border-border/60 px-4 py-10 text-center">
                  <Camera className="size-5 text-muted-foreground" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    Nothing yet. Ask her to send you something.
                  </p>
                </div>
              ) : (
                <div className="mt-4">
                  <ScrollArea className="max-h-[26rem]">
                    <div className="grid grid-cols-2 gap-3 pr-3">
                      {photos.map((photo) => (
                        <button
                          key={photo._id}
                          type="button"
                          onClick={() => photo.url && setLightbox(photo.url)}
                          className="group relative overflow-hidden rounded-xl border border-border/60"
                          title={photo.scene}
                        >
                          <img
                            src={photo.url ?? ""}
                            alt={photo.scene}
                            loading="lazy"
                            className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                          <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 pt-6 pb-1.5 text-left text-[10px] text-white/85">
                            {timeLabel(photo.createdAt)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

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
    </main>
  );
}
