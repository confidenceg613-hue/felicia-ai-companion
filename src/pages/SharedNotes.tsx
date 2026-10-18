import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import {
  SHARED_NOTE_SECTIONS,
} from "@/lib/felicia";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Check,
  Loader2,
  NotebookPen,
  Undo2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export default function SharedNotes() {
  const notes = useQuery(api.felicia.sharedNotes);
  const saveNotes = useMutation(api.felicia.saveSharedNotes);

  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const loading = notes === undefined;
  const sections = useMemo(
    () => ({ ...(notes?.sections ?? {}), ...edits }),
    [notes, edits],
  );
  const dirty = Object.keys(edits).length > 0;

  function edit(key: string, value: string) {
    setEdits((previous) => ({ ...previous, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveNotes({ sections });
      setEdits({});
      toast.success(
        "Shared Notes saved. She'll read them next time you speak.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't save your notes.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="glass sticky top-0 z-20 rounded-none border-x-0 border-t-0 px-4 py-4 sm:rounded-b-3xl sm:border-x">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl tracking-tight">
              Shared Notes
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Everything written here is handed to Felicia before she replies.
              Change a section and you change her.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {dirty && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-muted-foreground"
                onClick={() => setEdits({})}
              >
                <Undo2 className="size-3.5" />
                Revert
              </Button>
            )}
            <Button
              size="sm"
              className="gap-2"
              onClick={() => void handleSave()}
              disabled={!dirty || saving}
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              {dirty ? "Save notes" : "Saved"}
            </Button>
          </div>
        </div>

        {notes?.updatedAt ? (
          <p className="mx-auto mt-2 w-full max-w-3xl text-xs text-muted-foreground/70">
            Last saved{" "}
            {new Date(notes.updatedAt).toLocaleString([], {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4">
                <NotebookPen className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Backstory, preferences and boundaries steer how she talks.
                  Appearance is how she looks — it is what any new photo of her
                  is generated from, and what the photos she already has are
                  kept consistent with.
                </p>
              </div>

              {SHARED_NOTE_SECTIONS.map((section, index) => (
                <motion.div
                  key={section.key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -3, transition: { duration: 0.18, delay: 0 } }}
                  transition={{
                    duration: 0.3,
                    delay: Math.min(index * 0.04, 0.3),
                  }}
                  className="surface rounded-3xl p-6"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <label
                      htmlFor={`note-${section.key}`}
                      className="font-display text-xl tracking-tight"
                    >
                      {section.title}
                    </label>
                    <span className="text-[11px] text-muted-foreground/70">
                      {(sections[section.key] ?? "").length}/4000
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {section.hint}
                  </p>

                  <Textarea
                    id={`note-${section.key}`}
                    value={sections[section.key] ?? ""}
                    onChange={(event) =>
                      edit(section.key, event.target.value)
                    }
                    rows={
                      section.key === "appearance" ? 4 : 3
                    }
                    maxLength={4000}
                    className="mt-3 resize-y leading-relaxed"
                  />
                </motion.div>
              ))}

              <Separator />
              <p className="pb-4 text-center text-xs text-muted-foreground">
                Notes are read live — no need to restart the conversation.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
