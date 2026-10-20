import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useAction, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  BrainCircuit,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Table2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Felicia's mind map.
 *
 * Two ways in, the way the feature is normally presented: an interactive graph
 * where each thing she knows is a bubble sized by how firmly she holds it and
 * coloured by what kind of thing it is, and a sortable, searchable table for
 * when you'd rather just read the list. Selecting anything opens a dossier you
 * can edit.
 */

const CATEGORIES = [
  { key: "person", label: "People", color: "#8b9cf7" },
  { key: "place", label: "Places", color: "#57a0c6" },
  { key: "preference", label: "Tastes", color: "#c96f92" },
  { key: "moment", label: "Moments", color: "#78a867" },
  { key: "goal", label: "Goals", color: "#9b7bc9" },
  { key: "fact", label: "Facts", color: "#5fb8a8" },
] as const;

const categoryOf = (key: string) =>
  CATEGORIES.find((category) => category.key === key) ?? CATEGORIES[5];

/** Where each category's cluster sits inside the 800×520 graph canvas. */
const CLUSTER_CENTERS = [
  { x: 195, y: 155 },
  { x: 605, y: 150 },
  { x: 165, y: 385 },
  { x: 635, y: 375 },
  { x: 400, y: 115 },
  { x: 400, y: 430 },
];

interface Memory {
  _id: Id<"memories">;
  title: string;
  category: string;
  content: string;
  strength?: number;
  updatedAt: number;
}

/** A memory being written in the dossier dialog — new or existing. */
interface Draft {
  id: Id<"memories"> | null;
  title: string;
  category: string;
  content: string;
  strength: number;
}

/** Stable empty list, so the memoised views below don't recompute every render. */
const EMPTY_MEMORIES: Memory[] = [];

const EMPTY_DRAFT: Draft = {
  id: null,
  title: "",
  category: "fact",
  content: "",
  strength: 3,
};

function timeLabel(ms: number) {
  return new Date(ms).toLocaleDateString([], {
    day: "numeric",
    month: "short",
  });
}

/** Deterministic layout: one ring-packed cluster per category. */
function layoutGraph(memories: Memory[]) {
  const grouped = new Map<string, Memory[]>();
  for (const memory of memories) {
    const key = CATEGORIES.some((c) => c.key === memory.category)
      ? memory.category
      : "fact";
    const bucket = grouped.get(key);
    if (bucket) bucket.push(memory);
    else grouped.set(key, [memory]);
  }

  const nodes: Array<{
    memory: Memory;
    x: number;
    y: number;
    r: number;
    color: string;
  }> = [];
  const links: Array<{ from: number; to: number; color: string }> = [];

  for (const [key, bucket] of grouped) {
    const center =
      CLUSTER_CENTERS[
        Math.max(
          0,
          CATEGORIES.findIndex((category) => category.key === key),
        )
      ] ?? CLUSTER_CENTERS[5];
    const color = categoryOf(key).color;
    const startIndex = nodes.length;

    bucket.forEach((memory, index) => {
      const ring = Math.floor(index / 6);
      const angle = ((index % 6) * Math.PI * 2) / 6 + ring * 0.7;
      const orbit = 58 + ring * 52;
      const strength = memory.strength ?? 3;
      const r = 15 + strength * 5.5;

      let x = center.x + Math.cos(angle) * orbit;
      let y = center.y + Math.sin(angle) * orbit;
      x = Math.min(800 - r - 8, Math.max(r + 8, x));
      y = Math.min(520 - r - 8, Math.max(r + 8, y));

      nodes.push({ memory, x, y, r, color });

      if (index > 0) {
        links.push({ from: startIndex + index - 1, to: nodes.length - 1, color });
      }
    });
  }

  return { nodes, links };
}

/** "12 Mar – 2 Apr 2026" for a chapter's span, or one date if it is a single day. */
function chapterRange(from: number, to: number) {
  const start = new Date(from);
  const end = new Date(to);
  const sameDay = start.toDateString() === end.toDateString();
  const day = (date: Date) =>
    date.toLocaleDateString([], { day: "numeric", month: "short" });
  return sameDay ? day(end) : `${day(start)} – ${day(end)}`;
}

export default function Memories() {
  const memories = useQuery(api.felicia.memories);
  const chapters = useQuery(api.felicia.chapters);
  const addMemory = useMutation(api.felicia.addMemory);
  const updateMemory = useMutation(api.felicia.updateMemory);
  const deleteMemory = useMutation(api.felicia.deleteMemory);
  const seedMemories = useMutation(api.felicia.seedMemories);
  const captureMemories = useAction(api.felicia.captureMemories);

  const [view, setView] = useState<"graph" | "table">("graph");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "title">("recent");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const seededRef = useRef(false);

  // Plant the handful of facts from her own life the first time the map opens,
  // so it is never a blank canvas. The mutation re-checks that the table is
  // empty, which makes a StrictMode double-run harmless.
  useEffect(() => {
    if (seededRef.current || memories === undefined) return;
    seededRef.current = true;
    if (memories.length === 0) {
      void seedMemories({}).catch(() => {
        // Seeding is a convenience; a failure just leaves the map empty.
      });
    }
  }, [memories, seedMemories]);

  const list = memories ?? EMPTY_MEMORIES;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = list.filter((memory: { title: string; content: string; category: string }) => {
      if (!needle) return true;
      return (
        memory.title.toLowerCase().includes(needle) ||
        memory.content.toLowerCase().includes(needle) ||
        memory.category.toLowerCase().includes(needle)
      );
    });
    return sort === "title"
      ? [...matches].sort((a, b) => a.title.localeCompare(b.title))
      : [...matches].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [list, query, sort]);

  const graph = useMemo(() => layoutGraph(filtered), [filtered]);

  async function handleSave() {
    if (!draft) return;
    if (!draft.title.trim() || !draft.content.trim()) {
      toast.error("Give it a title and a line of detail.");
      return;
    }

    setSaving(true);
    try {
      const args = {
        title: draft.title,
        category: draft.category,
        content: draft.content,
        strength: draft.strength,
      };
      if (draft.id) await updateMemory({ id: draft.id, ...args });
      else await addMemory(args);
      setDraft(null);
      toast.success(draft.id ? "Memory updated." : "Memory added.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!draft?.id) return;
    try {
      await deleteMemory({ id: draft.id });
      setDraft(null);
      toast.success("Memory forgotten.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't delete that.",
      );
    }
  }

  async function handleCapture() {
    setCapturing(true);
    try {
      const result = await captureMemories({});
      toast.success(
        result.added === 0
          ? "Nothing new to add — she already knows that."
          : `Felicia kept ${result.added} new ${result.added === 1 ? "memory" : "memories"}.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't capture memories.",
      );
    } finally {
      setCapturing(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* ------------------------------------------------------------ header */}
      <header className="glass sticky top-0 z-20 rounded-none border-x-0 border-t-0 px-4 py-4 sm:rounded-b-3xl sm:border-x sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl tracking-tight">
              Mind map
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              What Felicia has kept from everything that's happened between you.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-border/60 bg-card p-0.5">
              {(
                [
                  { value: "graph", icon: BrainCircuit, label: "Graph" },
                  { value: "table", icon: Table2, label: "Table" },
                ] as const
              ).map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setView(option.value)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      view === option.value
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-3.5" />
                    {option.label}
                  </button>
                );
              })}
            </div>

            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => void handleCapture()}
              disabled={capturing}
            >
              {capturing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              Capture from chat
            </Button>

            <Button
              size="sm"
              className="gap-2"
              onClick={() => setDraft({ ...EMPTY_DRAFT })}
            >
              <Plus className="size-3.5" />
              Add
            </Button>
          </div>
        </div>

        <div className="mx-auto mt-4 flex w-full max-w-5xl flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search what she knows…"
              className="h-9 pl-9"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Sort</span>
            <Select
              value={sort}
              onValueChange={(value) => setSort(value as "recent" | "title")}
            >
              <SelectTrigger className="h-9 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Recently updated</SelectItem>
                <SelectItem value="title">Title A–Z</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="ml-auto text-xs text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
          </p>
        </div>
      </header>

      {/* ------------------------------------------------------------- body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto w-full max-w-5xl">
          {chapters && chapters.length > 0 && (
            <section className="surface mb-6 rounded-3xl p-6">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="font-display text-lg font-semibold tracking-tight">
                    Long-term memory
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Every stretch of your conversation, written up as it happened.
                    She reads these back when something connects.
                  </p>
                </div>
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] tracking-widest text-primary uppercase">
                  {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"}
                </span>
              </div>

              <ul className="mt-4 space-y-4">
                {chapters
                  .slice(0, 12)
                  .map(
                    (chapter: {
                      _id: string;
                      title: string;
                      summary: string;
                      fromCreatedAt: number;
                      toCreatedAt: number;
                      messageCount: number;
                    }) => (
                      <li
                        key={chapter._id}
                        className="border-l border-border/60 pl-3"
                      >
                        <p className="text-[11px] tracking-widest text-primary uppercase">
                          {chapterRange(chapter.fromCreatedAt, chapter.toCreatedAt)} ·{" "}
                          {chapter.messageCount} messages
                        </p>
                        <p className="mt-1 text-sm font-medium">{chapter.title}</p>
                        <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                          {chapter.summary}
                        </p>
                      </li>
                    ),
                  )}
              </ul>
            </section>
          )}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 px-6 py-20 text-center">
              <BrainCircuit className="size-6 text-muted-foreground" />
              <h2 className="mt-4 font-display text-xl">
                {list.length === 0
                  ? "She hasn't memorised anything yet"
                  : "Nothing matches that"}
              </h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                {list.length === 0
                  ? "A mind map forms from real conversation. Keep talking, then capture what she's learned — or add the first entry yourself."
                  : "Try a different word, or clear the search."}
              </p>
              <Button
                className="mt-5 gap-2"
                onClick={() => setDraft({ ...EMPTY_DRAFT })}
              >
                <Plus className="size-4" />
                Add a memory
              </Button>
            </div>
          ) : view === "graph" ? (
            <div className="surface overflow-hidden rounded-3xl p-2">
              <svg
                viewBox="0 0 800 520"
                className="h-auto w-full"
                role="img"
                aria-label="Graph of everything Felicia remembers"
              >
                <g>
                  {graph.links.map((link, index) => {
                    const from = graph.nodes[link.from];
                    const to = graph.nodes[link.to];
                    if (!from || !to) return null;
                    return (
                      <line
                        key={`l${index}`}
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke={link.color}
                        strokeOpacity={0.35}
                        strokeWidth={1.25}
                      />
                    );
                  })}
                </g>

                {graph.nodes.map((node, index) => {
                  const floatDuration = 4.2 + (index % 6) * 0.6;
                  const floatDelay = (index % 7) * 0.45;
                  return (
                  <motion.g
                    key={node.memory._id}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{
                      opacity: 1,
                      scale: 1,
                      y: [0, -4, 0],
                    }}
                    transition={{
                      opacity: {
                        duration: 0.4,
                        delay: Math.min(index * 0.03, 0.6),
                      },
                      scale: {
                        duration: 0.4,
                        delay: Math.min(index * 0.03, 0.6),
                      },
                      y: {
                        duration: floatDuration,
                        delay: floatDelay,
                        repeat: Infinity,
                        ease: "easeInOut",
                      },
                    }}
                    style={{ transformOrigin: `${node.x}px ${node.y}px` }}
                    className="cursor-pointer"
                    onClick={() =>
                      setDraft({
                        id: node.memory._id,
                        title: node.memory.title,
                        category: node.memory.category,
                        content: node.memory.content,
                        strength: node.memory.strength ?? 3,
                      })
                    }
                  >
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.r}
                      fill={node.color}
                      fillOpacity={0.2}
                      stroke={node.color}
                      strokeOpacity={0.85}
                      strokeWidth={1.5}
                    />
                    <text
                      x={node.x}
                      y={node.y + 3}
                      textAnchor="middle"
                      className="fill-foreground text-[9px] font-medium"
                    >
                      {node.memory.title.length > 16
                        ? `${node.memory.title.slice(0, 15)}…`
                        : node.memory.title}
                    </text>
                    <text
                      x={node.x}
                      y={node.y + 15}
                      textAnchor="middle"
                      className="fill-muted-foreground text-[7.5px]"
                    >
                      {categoryOf(node.memory.category).label}
                    </text>
                  </motion.g>
                  );
                })}
              </svg>

              <div className="flex flex-wrap items-center gap-3 border-t border-border/50 px-3 py-3">
                {CATEGORIES.map((category) => (
                  <span
                    key={category.key}
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                  >
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    {category.label}
                  </span>
                ))}
                <span className="ml-auto text-[11px] text-muted-foreground/70">
                  Bubble size = how firmly she holds it
                </span>
              </div>
            </div>
          ) : (
            <div className="surface overflow-hidden rounded-3xl">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Memory</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Detail
                    </TableHead>
                    <TableHead className="text-right">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((memory) => {
                    const category = categoryOf(memory.category);
                    return (
                      <TableRow
                        key={memory._id}
                        className="cursor-pointer"
                        onClick={() =>
                          setDraft({
                            id: memory._id,
                            title: memory.title,
                            category: memory.category,
                            content: memory.content,
                            strength: memory.strength ?? 3,
                          })
                        }
                      >
                        <TableCell className="font-medium">
                          {memory.title}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                            <span
                              className="size-2 rounded-full"
                              style={{ backgroundColor: category.color }}
                            />
                            {category.label}
                          </span>
                        </TableCell>
                        <TableCell className="hidden max-w-md truncate text-muted-foreground sm:table-cell">
                          {memory.content}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {timeLabel(memory.updatedAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------- dossier */}
      <Dialog
        open={draft !== null}
        onOpenChange={(open) => !open && setDraft(null)}
      >
        <DialogContent className="max-w-lg border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {draft?.id ? "Memory" : "New memory"}
            </DialogTitle>
            <DialogDescription>
              {draft?.id
                ? "Felicia reads this every time she replies."
                : "Write something down for her to keep."}
            </DialogDescription>
          </DialogHeader>

          {draft && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="memory-title">Title</Label>
                <Input
                  id="memory-title"
                  value={draft.title}
                  onChange={(event) =>
                    setDraft({ ...draft, title: event.target.value })
                  }
                  placeholder="October swimming"
                  maxLength={80}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="memory-category">Kind</Label>
                  <Select
                    value={draft.category}
                    onValueChange={(value) =>
                      setDraft({ ...draft, category: value })
                    }
                  >
                    <SelectTrigger id="memory-category" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((category) => (
                        <SelectItem key={category.key} value={category.key}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="memory-strength">How firmly held</Label>
                  <Select
                    value={String(draft.strength)}
                    onValueChange={(value) =>
                      setDraft({ ...draft, strength: Number(value) })
                    }
                  >
                    <SelectTrigger id="memory-strength" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((value) => (
                        <SelectItem key={value} value={String(value)}>
                          {value} of 5
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="memory-content">Detail</Label>
                <Textarea
                  id="memory-content"
                  value={draft.content}
                  onChange={(event) =>
                    setDraft({ ...draft, content: event.target.value })
                  }
                  placeholder="She swims in the Atlantic in October, and wants to shoot it."
                  rows={3}
                  maxLength={600}
                />
                <p className="text-right text-[11px] text-muted-foreground">
                  {draft.content.length}/600
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="items-center gap-2 sm:justify-between">
            <div>
              {draft?.id && (
                <Button
                  variant="ghost"
                  className="gap-2 text-destructive hover:text-destructive"
                  onClick={() => void handleDelete()}
                >
                  <Trash2 className="size-4" />
                  Forget it
                </Button>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button
                className="gap-2"
                onClick={() => void handleSave()}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : draft?.id ? (
                  <Pencil className="size-4" />
                ) : (
                  <Plus className="size-4" />
                )}
                {draft?.id ? "Save" : "Add memory"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
