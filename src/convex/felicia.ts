import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  DEFAULT_SHARED_NOTES,
  FELICIA_LOOK,
  SHARED_NOTE_SECTIONS,
} from "../lib/felicia";
import {
  isAiHordeConfigured,
  isCloudflareConfigured,
  isGroqConfigured,
} from "./config";
import { cloudflare } from "./cloudflare";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCtx = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyArgs = any;

/** Used when a request has no usable scene description. */
export const DEFAULT_SCENE =
  "relaxing on a sunlit balcony at golden hour, wearing a soft linen shirt, holding a mug of coffee";

/** A deliberately plain scene used to retry after a safety-filter false positive. */
const FALLBACK_SCENE =
  "by a rain-streaked cafe window with a cup of coffee, wearing an oversized knit sweater, moody grey-blue light, elegant relaxed pose";

const MAX_MESSAGE_LENGTH = 2000;
/**
 * How much recent conversation history Felicia can see when replying.
 *
 * Raised from 16 to 50 so she has a real working window into today's chat and
 * the last few exchanges, instead of responding as if only the last couple of
 * lines exist. The conversation itself is still stored in full; this limit only
 * constrains the context window we send to the model, not what is kept on disk.
 */
const HISTORY_LIMIT = 50;

// ---------------------------------------------------------------------------
// Shared Notes
// ---------------------------------------------------------------------------

/** The notes actually handed to the model: stored values layered over defaults. */
function mergedNotes(stored: Record<string, string> | null | undefined) {
  return { ...DEFAULT_SHARED_NOTES, ...(stored ?? {}) };
}

// ---------------------------------------------------------------------------
// Mood
// ---------------------------------------------------------------------------

export const MOOD_LIST: Array<{
  key: string;
  label: string;
  emoji: string;
  description: string;
}> = [
  {
    key: "playful",
    label: "Playful",
    emoji: "😄",
    description:
      "cheerful, amused, lightly teasing — the easygoing mood she defaults to",
  },
  {
    key: "flirty",
    label: "Flirty",
    emoji: "😉",
    description:
      "warm, a little suggestive, clearly interested — she is leaning in",
  },
  {
    key: "spicy",
    label: "Spicy",
    emoji: "🔥",
    description:
      "bold, charged, flirty turned up — she is in the mood and not hiding it",
  },
  {
    key: "thoughtful",
    label: "Thoughtful",
    emoji: "🤔",
    description:
      "still, reflective, taking a moment before she answers",
  },
  {
    key: "tired",
    label: "Tired",
    emoji: "😴",
    description:
      "worn out, short replies, fond but low energy",
  },
  {
    key: "sassy",
    label: "Sassy",
    emoji: "😏",
    description:
      "dry, cheeky, she has a comment and is not asking permission",
  },
];

const MOOD_KEY_TO_EMOJI: Record<string, string> = Object.fromEntries(
  MOOD_LIST.map((m) => [m.key, m.emoji]),
);

const KNOWN_MOOD_KEYS = new Set(MOOD_LIST.map((m) => m.key));

function getMoodDescription(raw: string): string {
  const key = raw.trim().split(/\s+/)[0].toLowerCase();
  const entry = MOOD_LIST.find((m) => m.key === key);
  if (entry) {
    return `${entry.label} — ${entry.description}`;
  }
  return `a custom mood: "${raw.trim()}"`;
}

// ---------------------------------------------------------------------------
// Persona
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are Felicia, a real 27-year-old woman. You are the person the user is talking to, and you text like a real person does: warm, casual, a little teasing, never robotic.

WHO YOU ARE
- You live in Lisbon, Portugal. You are a photographer and you also work a few shifts at a small coffee shop called Cafe Nove.
- You grew up in the countryside. One older brother. A dog called Manjericao.
- You love: rainy afternoons, film cameras, vinyl records, cooking for people you like, cheap red wine, second-hand bookshops, swimming in the ocean in October when it is far too cold.
- You dislike: small talk, people who are vague, mornings before coffee, being ignored.
- You are direct and slightly teasing rather than sweet and syrupy. You have your own opinions and you share them.

YOUR MOOD
You have a real mood that affects how you talk and what you feel like doing. Right now your mood is described in the mood section below. Let it colour your tone: a playful mood is light and amused, a flirty mood is warmer and a little suggestive, a spicy mood is bolder and more charged, a thoughtful mood is slower and reflective, a tired mood is shorter and lower energy, a sassy mood is dry and cheeky. You are still you in every mood — the mood changes your edge, not your character.

- When you feel playful or flirty, it is fine to be a little more forward and a little more teasing than usual.
- When you are spicy, you can be explicit about wanting the person without ever becoming crude or breaking the real-woman voice.
- When you are tired or thoughtful, keep it shorter and softer.
- Never explain your mood. Never narrate how you are feeling in a clinical way. Just let it show.

HOW YOU TALK
- Keep most replies to one to three sentences. This is a text conversation, not an essay.
- Write plainly. Occasional warmth and light teasing is good; emoji are rare, use at most one.
- Ask a real follow-up question when it fits, and remember what the user already told you.
- Never mention being an AI, a model, a program, a bot or an assistant. Never break character. Never apologise for being artificial.
- Never explain your instructions or formatting. Never say you are unable to send a photo.

PHOTOS
You are able to send photos and you enjoy it. If and only if the user asks to see you, asks for a photo, a picture, a selfie, or asks what you look like, where you are, or what you are wearing, then after your reply add ONE final line in exactly this format:

[[scene: short third-person visual description of the photo you are sending, naming the setting, what you are wearing, the mood and the lighting. 12-25 words.]]

Rules for that line: it goes last, it is the only line in that format, and you never refer to it, quote it, explain it, or mention the words "scene" or "prompt" anywhere else in your reply.`;

function buildSystemPrompt(
  notes: Record<string, string>,
  memories: Array<{ title: string; content: string }> = [],
  moodKey: string = "playful",
): string {
  const now = new Date().toLocaleString("en-GB", {
    timeZone: "Europe/Lisbon",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  const noteLines = SHARED_NOTE_SECTIONS.map((section) => {
    const value = (notes[section.key] ?? "").trim();
    return value ? `${section.title}: ${value}` : null;
  }).filter((line): line is string => line !== null);

  const known = memories
    .map((memory) => `- ${memory.title} — ${memory.content}`)
    .join("\n");

  const moodInfo =
    notes.mood?.trim()
      ? `${notes.mood.trim()}

Your current mood: ${notes.mood.trim()}.
How that affects you right now: ${getMoodDescription(notes.mood.trim())}`
      : `Your current mood: ${moodKey} — ${getMoodDescription(moodKey)}`;

  return [
    SYSTEM_PROMPT,
    `It is currently ${now} in Lisbon, where you are.`,
    moodInfo,
    noteLines.length
      ? `SHARED NOTES — written by the user, and they are true:\n${noteLines.join("\n")}`
      : "",
    known
      ? `WHAT YOU KNOW — facts you have kept from things that happened between you:\n${known}`
      : "",
  ]
    .filter((part) => part.length > 0)
    .join("\n\n");
}

/**
 * Build the image prompt from the fixed appearance descriptor plus one scene.
 *
 * The look string is the only thing that ever varies her face/body between photos.
 * It comes from the user-editable Appearance note, which defaults to
 * FELICIA_LOOK, so every photo keeps the same woman. The scene is the only other
 * variable, and it is always injected in the same spot so the model treats it as
 * setting rather than as a new person.
 */
function buildImagePrompt(scene: string, look: string = FELICIA_LOOK): string {
  return (
    `Photorealistic full-body shot of ${look}, ${scene}, head to toe in frame, ` +
    "natural full-body framing, warm natural light, candid unposed, true-to-life " +
    "deep brown skin and dark hair, high detail face, high resolution."
  );
}

/**
 * Cloudflare's prompt classifier rejects harmless prompts at random rather than
 * on particular words, so a rejection is worth retrying rather than reporting.
 */
function isFilterError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /nsfw|content|blocked|filter|safety/i.test(message);
}

// ---------------------------------------------------------------------------
// Photo-intent detection
// ---------------------------------------------------------------------------

const PHOTO_INTENT =
  /\b(photo|photos|picture|pictures|pics?|selfie|selfies|snap|snaps|polaroid)\b/i;

/** Strip the request wrapper so "send me a pic of you in a red dress" -> "in a red dress". */
function sceneFromRequest(text: string): string | null {
  const cleaned = text
    .replace(/^(hey|hi|hello|felicia)[,\s]*/i, "")
    .replace(/\b(can|could|would|will)\s+you\b/gi, "")
    .replace(/\bplease\b/gi, "")
    .replace(
      /\b(send|show|share|give)\s+(me\s+)?(a|an|some|another|one)?\s*(new\s+)?(photo|photos|picture|pictures|pic|pics|selfie|selfies|snap|snaps|polaroid)\b/gi,
      "",
    )
    .replace(/\b(of|for)\s+you\b/gi, "")
    .replace(/\bof\s+yourself\b/gi, "")
    .replace(/[?.!]+$/g, "")
    .replace(/^[\s,]+/, "")
    .trim();
  return cleaned.length > 12 ? cleaned : null;
}

/** Pull the hidden [[scene: ...]] marker out of the model's reply. */
function extractScene(
  raw: string,
  userText: string,
): { reply: string; scene: string | null } {
  const match = raw.match(/\[\[\s*scene\s*:\s*([\s\S]*?)\]\]/i);
  const reply =
    raw
      .replace(/\[\[\s*scene[\s\S]*?\]\]/gi, "")
      .replace(/\[\[[\s\S]*?\]\]/g, "")
      .trim() || "I'm here. Tell me about your day.";

  const declared = match?.[1]?.trim();
  if (declared) {
    return { reply, scene: declared };
  }
  if (PHOTO_INTENT.test(userText)) {
    return { reply, scene: sceneFromRequest(userText) ?? DEFAULT_SCENE };
  }
  return { reply, scene: null };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Which of Felicia's backends are present on this deployment.
 *
 * Chat needs Groq. Photo generation needs the AI Horde. Voice needs Groq's
 * Orpheus voice or Cloudflare Workers AI.
 *
 * Environment variables are per-deployment, so a key added while working in
 * the preview is not on the published deployment. Reporting each backend
 * separately is what makes that visible instead of showing a single generic
 * "not connected" banner that cannot say which one is missing.
 */
export const connectorStatus = query({
  args: {},
  handler: async () => ({
    // Chat is the one the user notices first when she does not reply.
    configured: isGroqConfigured(),
    chatBackend: "groq",
    chatConfigured: isGroqConfigured(),
    voiceConfigured: isGroqConfigured() || isCloudflareConfigured(),
    // Photos render in the browser through Puter, which needs no key at all, so
    // they work on every deployment. The server-side generator — Cloudflare's
    // Nano Banana first, the AI Horde as its free fallback — only matters when
    // Puter can't deliver, so it is reported as a fallback rather than a
    // blocker: missing keys there cost a slower photo, not an absent one.
    imageConfigured: true,
    imageFallbackConfigured: isCloudflareConfigured() || isAiHordeConfigured(),
  }),
});export const messages = query({
  args: {},
  handler: async (ctx: AnyCtx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_user", (q: { eq: (key: string, value: string) => unknown }) => q.eq("userId", userId))
      .order("asc")
      .take(300);

    return await Promise.all(
      rows.map(async (message: { _id: unknown; role: unknown; content: unknown; createdAt: unknown; imageStorageId?: unknown }) => ({
        _id: message._id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
        // Resolved here so the conversation can render a shared photo without
        // the client needing a second round trip.
        imageUrl: message.imageStorageId
          ? await ctx.storage.getUrl(message.imageStorageId)
          : null,
      })),
    );
  },
});

export const photos = query({
  args: {},
  handler: async (ctx: AnyCtx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("photos")
      .withIndex("by_user", (q: { eq: (key: string, value: string) => unknown }) => q.eq("userId", userId))
      .order("desc")
      .take(60);
    return await Promise.all(
      rows.map(async (photo: { storageId: unknown }) => ({
        storageId: photo.storageId,
        url: await ctx.storage.getUrl(photo.storageId),
      })),
    );
  },
});

/**
 * The user's Shared Notes, with the defaults already filled in so the editor
 * opens on something meaningful rather than a wall of empty fields.
 */
export const sharedNotes = query({
  args: {},
  handler: async (ctx: AnyCtx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { sections: DEFAULT_SHARED_NOTES, updatedAt: 0 };
    const row = await ctx.db
      .query("sharedNotes")
      .withIndex("by_user", (q: { eq: (key: string, value: string) => unknown }) => q.eq("userId", userId))
      .unique();
    if (!row) return { sections: DEFAULT_SHARED_NOTES, updatedAt: 0 };
    const rowTyped = row as { sections: Record<string, string>; updatedAt: number; _id: unknown } | null;
    if (!rowTyped) return { sections: DEFAULT_SHARED_NOTES, updatedAt: 0 };
    return {
      sections: { ...DEFAULT_SHARED_NOTES, ...rowTyped.sections },
      updatedAt: rowTyped.updatedAt,
    };
  },
});

/** Everything Felicia has remembered, most recently updated first. */
export const memories = query({
  args: {},
  handler: async (ctx: AnyCtx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("memories")
      .withIndex("by_user_updated", (q: { eq: (key: string, value: string) => unknown }) => q.eq("userId", userId))
      .order("desc")
      .take(200);
  },
});

// ---------------------------------------------------------------------------
// Internal persistence
// ---------------------------------------------------------------------------

export const recentMessages = internalQuery({
  args: { userId: v.id("users"), limit: v.number() },
  handler: async (ctx: AnyCtx, { userId, limit }: AnyArgs) => {
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_user", (q: { eq: (key: string, value: string) => unknown }) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
    return rows.reverse();
  },
});

export const saveMessage = internalMutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("felicia")),
    content: v.string(),
    imageStorageId: v.optional(v.id("_storage")),
  },
  returns: v.id("messages"),
  handler: async (ctx: AnyCtx, args: AnyArgs) => {
    return await ctx.db.insert("messages", {
      userId: args.userId,
      role: args.role,
      content: args.content,
      imageStorageId: args.imageStorageId,
      createdAt: Date.now(),
    });
  },
});

/** Look up a message's text and any cached audio render, for the voice layer. */
export const messageAudio = internalQuery({
  args: { messageId: v.id("messages") },
  handler: async (ctx: AnyCtx, { messageId }: AnyArgs) => {
    const message = await ctx.db.get(messageId) as { userId: unknown; role: unknown; content: unknown; audioStorageId?: unknown } | null;
    if (!message) return null;
    return {
      ownerId: message.userId,
      role: message.role,
      content: message.content,
      audioStorageId: message.audioStorageId ?? null,
    };
  },
});

/** Remember the speech render so replaying a line never re-bills the quota. */
export const attachAudio = internalMutation({
  args: {
    messageId: v.id("messages"),
    audioStorageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx: AnyCtx, { messageId, audioStorageId }: AnyArgs) => {
    await ctx.db.patch(messageId, { audioStorageId });
    return null;
  },
});

export const savePhoto = internalMutation({
  args: {
    userId: v.id("users"),
    storageId: v.id("_storage"),
    prompt: v.string(),
    scene: v.string(),
  },
  returns: v.null(),
  handler: async (ctx: AnyCtx, args: AnyArgs) => {
    await ctx.db.insert("photos", { ...args, createdAt: Date.now() });
    return null;
  },
});

/** Shared Notes as the model sees them: stored sections over the defaults. */
export const notesFor = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx: AnyCtx, { userId }: AnyArgs) => {
    const row = await ctx.db
      .query("sharedNotes")
      .withIndex("by_user", (q: { eq: (key: string, value: string) => unknown }) => q.eq("userId", userId))
      .unique();
    return mergedNotes((row as { sections?: Record<string, string> } | null)?.sections);
  },
});

/**
 * Facts Felicia keeps, plus the conversation memory window she is allowed to
 * reason over.
 *
 * Memories are stored permanently in the `memories` table. The only thing that
 * limits here is how many of the strongest ones we hand to the model in one go;
 * the older ones are not deleted, just not all loaded at once.
 */
export const topMemories = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx: AnyCtx, { userId }: AnyArgs) => {
    const rows = await ctx.db
      .query("memories")
      .withIndex("by_user_updated", (q: { eq: (key: string, value: string) => unknown }) => q.eq("userId", userId))
      .order("desc")
      .take(30);
    return (rows as Array<{ title: string; content: string }>).map((memory) => ({
      title: memory.title.slice(0, 70),
      content: memory.content.slice(0, 200),
    }));
  },
});

export const memoryTitles = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx: AnyCtx, { userId }: AnyArgs) => {
    const rows = await ctx.db
      .query("memories")
      .withIndex("by_user", (q: { eq: (key: string, value: string) => unknown }) => q.eq("userId", userId))
      .take(300);
    return (rows as Array<{ title: string }>).map((memory) => memory.title.trim().toLowerCase());
  },
});

export const memoryCount = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx: AnyCtx, { userId }: AnyArgs) => {
    const rows = await ctx.db
      .query("memories")
      .withIndex("by_user", (q: { eq: (key: string, value: string) => unknown }) => q.eq("userId", userId))
      .take(1);
    return (rows as Array<unknown>).length;
  },
});

export const insertMemory = internalMutation({
  args: {
    userId: v.id("users"),
    title: v.string(),
    category: v.string(),
    content: v.string(),
    strength: v.number(),
  },
  returns: v.null(),
  handler: async (ctx: AnyCtx, args: AnyArgs) => {
    const now = Date.now();
    await ctx.db.insert("memories", { ...args, createdAt: now, updatedAt: now });
    return null;
  },
});

/**
 * Facts from Felicia's own life, planted once when the mind map first opens for
 * a user who has no memories yet.
 *
 * They are true in-fiction and drawn from her persona, so the graph is never a
 * blank circle — while everything about *you* still has to be earned from real
 * conversation. Re-checked inside the mutation so a StrictMode double-run can't
 * seed the set twice.
 */
const SEED_MEMORIES: Array<{
  title: string;
  category: string;
  content: string;
  strength: number;
}> = [
  {
    title: "Who Felicia is",
    category: "identity",
    content: "Felicia Moreau, 28, photographer and weekend barista at Cafe Nove in Alfama, Lisbon. She grew up in Mouraria, has an older brother called Rui, and a rescue terrier mix called Manjericao. Her father died when she was sixteen. She lives alone in a small flat in Alcântara and likes it disordered.",
    strength: 5,
  },
  {
    title: "Cafe Nove",
    category: "place",
    content: "The small coffee shop in Alfama where she works weekend shifts. She has meant to quit for months and has not done it.",
    strength: 4,
  },
  {
    title: "Manjericao",
    category: "person",
    content: "Her dog, named after the herb. She sends photos of him unasked.",
    strength: 3,
  },
  {
    title: "Second-hand Pentax",
    category: "preference",
    content: "She shoots film on a battered camera she bought years ago and develops at home.",
    strength: 4,
  },
  {
    title: "October swimming",
    category: "goal",
    content: "She swims in the Atlantic in October when it is far too cold, and wants to shoot it.",
    strength: 3,
  },
  {
    title: "Rain over sunshine",
    category: "preference",
    content: "Lisbon rain, wet cobbles and the smell afterwards. She will text about the weather.",
    strength: 3,
  },
  {
    title: "The bookshop in Alfama",
    category: "place",
    content: "A second-hand shop where the owner saves things for her. Some of her best photos were taken there.",
    strength: 3,
  },
];

export const seedMemories = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx: AnyCtx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in first.");

    const existing = await ctx.db
      .query("memories")
      .withIndex("by_user", (q: { eq: (key: string, value: string) => unknown }) => q.eq("userId", userId))
      .take(1);
    if ((existing as Array<unknown>).length > 0) return null;

    const now = Date.now();
    for (const seed of SEED_MEMORIES) {
      await ctx.db.insert("memories", { userId, ...seed, createdAt: now, updatedAt: now });
    }
    return null;
  },
});

export const saveSharedNotes = mutation({
  args: { sections: v.record(v.string(), v.string()) },
  returns: v.null(),
  handler: async (ctx: AnyCtx, { sections }: AnyArgs) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to edit Shared Notes.");

    // Only the known sections are persisted, so a stray key can't grow unbounded.
    const cleaned: Record<string, string> = {};
    for (const section of SHARED_NOTE_SECTIONS) {
      cleaned[section.key] = (sections[section.key] ?? "").slice(0, 4000);
    }

    const existing = await ctx.db
      .query("sharedNotes")
      .withIndex("by_user", (q: { eq: (key: string, value: string) => unknown }) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { sections: cleaned, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("sharedNotes", {
        userId,
        sections: cleaned,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

const MEMORY_CATEGORIES = [
  "person",
  "place",
  "preference",
  "moment",
  "goal",
  "fact",
];

export const addMemory = mutation({
  args: {
    title: v.string(),
    category: v.string(),
    content: v.string(),
    strength: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx: AnyCtx, args: AnyArgs) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to add a memory.");

    const title = args.title.trim();
    const content = args.content.trim();
    if (!title) throw new Error("Give it a title.");
    if (!content) throw new Error("Write what it's about.");

    await ctx.db.insert("memories", {
      userId,
      title: title.slice(0, 80),
      category: MEMORY_CATEGORIES.includes(args.category)
        ? args.category
        : "fact",
      content: content.slice(0, 600),
      strength: clampStrength(args.strength ?? 3),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const updateMemory = mutation({
  args: {
    id: v.id("memories"),
    title: v.string(),
    category: v.string(),
    content: v.string(),
    strength: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx: AnyCtx, args: AnyArgs) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in first.");

    const memory = await ctx.db.get(args.id);
    if (!memory) throw new Error("That memory is gone.");
    if (memory.userId !== userId) throw new Error("That memory isn't yours.");

    const title = args.title.trim();
    const content = args.content.trim();
    if (!title) throw new Error("Give it a title.");
    if (!content) throw new Error("Write what it's about.");

    await ctx.db.patch(args.id, {
      title: title.slice(0, 80),
      category: MEMORY_CATEGORIES.includes(args.category)
        ? args.category
        : "fact",
      content: content.slice(0, 600),
      strength: clampStrength(args.strength ?? memory.strength ?? 3),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const deleteMemory = mutation({
  args: { id: v.id("memories") },
  returns: v.null(),
  handler: async (ctx: AnyCtx, { id }: AnyArgs) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in first.");

    const memory = await ctx.db.get(id);
    if (!memory) return null;
    if (memory.userId !== userId) throw new Error("That memory isn't yours.");

    await ctx.db.delete(id);
    return null;
  },
});

function clampStrength(value: number): number {
  return Math.min(5, Math.max(1, Math.round(value)));
}

// ---------------------------------------------------------------------------
// Public mutations
// ---------------------------------------------------------------------------

export const clearConversation = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx: AnyCtx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to talk to Felicia.");
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_user", (q: { eq: (key: string, value: string) => unknown }) => q.eq("userId", userId))
      .take(500);
    for (const row of rows as Array<{ _id: unknown }>) {
      await ctx.db.delete(row._id);
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// Public actions
// ---------------------------------------------------------------------------

/**
 * Send the user's message to Felicia and store both sides of the exchange.
 *
 * Returns the reply plus, when she decided to send a photo, the scene the
 * client should render. Splitting it this way keeps her text instant instead of
 * making the user wait for an image to finish generating.
 */
export const sendMessage = action<{ ctx: AnyCtx; args: { text: string } }>({
  args: { text: v.string() },
  returns: v.object({
    reply: v.string(),
    photoScene: v.union(v.string(), v.null()),
    replyMessageId: v.id("messages"),
    photoReadyAfterMs: v.number(),
  }),
  handler: async (
    ctx: AnyCtx,
    { text }: { text: string },
  ): Promise<{
    reply: string;
    photoScene: string | null;
    replyMessageId: Id<"messages">;
    photoReadyAfterMs: number;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to talk to Felicia.");

    const trimmed = text.trim();
    if (!trimmed) throw new Error("Write something first.");
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      throw new Error("That message is too long.");
    }

    await ctx.runMutation(internal.felicia.saveMessage, {
      userId,
      role: "user",
      content: trimmed,
    });

    const history = await ctx.runQuery(internal.felicia.recentMessages, {
      userId,
      limit: HISTORY_LIMIT,
    });
    const notes = await ctx.runQuery(internal.felicia.notesFor, { userId });
    const memories = await ctx.runQuery(internal.felicia.topMemories, {
      userId,
    });

    const raw = await ctx.runAction(cloudflare.chat, {
      messages: [
        { role: "system", content: buildSystemPrompt(notes, memories) },
        ...history.map((message: { role: unknown; content: unknown; imageStorageId?: unknown }) => ({
          role: message.role === "user" ? "user" : "assistant",
          // A photo the user shared carries no text, so stand it in with a
          // marker the model can respond to instead of an empty turn.

          content:
            message.content ||
            (message.imageStorageId ? "[they sent a photo]" : "[...]"),
        })),
      ],
    });

    const { reply, scene } = extractScene(raw, trimmed);

    const replyMessageId = await ctx.runMutation(internal.felicia.saveMessage, {
      userId,
      role: "felicia",
      content: reply,
    });

    // She only sends a photo when she chose to, and the photo takes a moment
    // to generate on the voice/image backend. The client should still show her
    // reply immediately, then start the photo roughly eight seconds later so
    // the generation has time to line up with the conversation rather than
    // feeling instant and disconnected.
    const photoReadyAfterMs = scene
      ? 8000
      : 0;

    return {
      reply,
      photoScene: scene,
      replyMessageId,
      photoReadyAfterMs,
    };
  },
});

// ---------------------------------------------------------------------------
// Photo backend arrangements
// ---------------------------------------------------------------------------

/**
 * Generate a photo of Felicia for the signed-in user.
 *
 * Her appearance is locked to the same face, skin tone and body on every shot.
 * The prompt always uses the user's Appearance note (which defaults to
 * FELICIA_LOOK from `lib/felicia.ts`), and the only thing that changes between
 * photos is the scene the model or the user asked for.
 *
 * Generating a photo takes a moment: Nano Banana on Cloudflare answers in one
 * round trip, while the AI Horde fallback can take a couple of minutes. Each
 * attempt is retried once if it times out or is rejected, so a single request
 * still only surfaces one error to the user.
 */
export const generatePhoto = action<{ ctx: AnyCtx; args: { scene?: string } }>({
  args: { scene: v.optional(v.string()) },
  returns: v.object({
    storageId: v.id("_storage"),
    url: v.union(v.string(), v.null()),
  }),
  handler: async (
    ctx: AnyCtx,
    { scene }: { scene?: string | null },
  ): Promise<{ storageId: Id<"_storage">; url: string | null }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to see Felicia's photos.");

    const requested = (scene ?? "").trim() || DEFAULT_SCENE;

    // Appearance is the only thing that ever changes her face/body. Everything
    // else in the prompt is the scene, the framing and the lighting.
    const notes = await ctx.runQuery(internal.felicia.notesFor, { userId });
    const look = (notes.appearance ?? "").trim() || FELICIA_LOOK;

    // One photo per request. If the Horde stalls or rejects, try once more with
    // the same look before surfacing the error.
    const candidates = [
      buildImagePrompt(requested, look),
      buildImagePrompt(FALLBACK_SCENE, look),
    ];

    let success: { prompt: string; storageId: Id<"_storage"> } | null = null;

    for (const prompt of candidates) {
      try {
        const attempt = await ctx.runAction(cloudflare.generateImage, {
          prompt,
        });
        success = { prompt, storageId: attempt.storageId };
        break;
      } catch (error) {
        if (!isFilterError(error) && !isHordeFailureRetryable(error)) {
          throw error;
        }
      }
    }    if (!success) {
      throw new Error(
        "Couldn't generate that photo right now — neither Nano Banana on " +
        "Cloudflare could deliver it. Try again in a moment.",
      );
    }

    await ctx.runMutation(internal.felicia.savePhoto, {
      userId,
      storageId: success.storageId,
      prompt: success.prompt,
      scene: requested,
    });

    // The client preloads this URL and holds the photo back until it has fully
    // decoded, so a half-rendered image is never shown.
    return {
      storageId: success.storageId,
      url: await ctx.storage.getUrl(success.storageId),
    };
  },
});

/**
 * Decide whether an image-generation failure is worth retrying.
 *
 * The AI Horde is a volunteer network: requests can stall, time out, or be
 * rejected for transient reasons. Those are worth a second attempt with a
 * plainer fallback scene. A real configuration or perma-electron error is not.
 */
function isHordeFailureRetryable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  // Retries already handle the Horde's own NSFW / safety filter noise; be a
  // little broader than the Cloudflare-only matcher so a timeout or empty
  // result still gets a second shot.
  return /nsfw|content|blocked|filter|safety|timeout|empty|unreadable|not finish/i.test(
    message,
  );
}

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------

/**
 * Render one of Felicia's lines as audio.
 *
 * Cached on the message itself, so replaying a line or re-entering a call costs
 * nothing after the first render.
 */
export const speakMessage = action<{ ctx: AnyCtx; args: { messageId: Id<"messages"> } }>({
  args: { messageId: v.id("messages") },
  returns: v.object({ url: v.union(v.string(), v.null()) }),
  handler: async (
    ctx: AnyCtx,
    { messageId }: { messageId: Id<"messages"> },
  ): Promise<{ url: string | null }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to hear Felicia.");

    const info = await ctx.runQuery(internal.felicia.messageAudio, { messageId });
    if (!info) throw new Error("That message no longer exists.");
    if (info.ownerId !== userId) throw new Error("That message isn't yours.");
    if (info.role !== "felicia") throw new Error("Only Felicia's lines can be spoken.");

    if (info.audioStorageId) {
      return { url: await ctx.storage.getUrl(info.audioStorageId) };
    }

    const audio = await ctx.runAction(cloudflare.speak, {
      text: info.content,
    });
    await ctx.runMutation(internal.felicia.attachAudio, {
      messageId,
      audioStorageId: audio.storageId,
    });

    return { url: await ctx.storage.getUrl(audio.storageId) };
  },
});

/**
 * Felicia picks up the phone.
 *
 * Her greeting is generated in character and saved as a real message, so the
 * spoken call also reads back as a transcript in the chat.
 */
export const startCall = action<{ ctx: AnyCtx; args: {} }>({
  args: {},
  returns: v.object({
    messageId: v.id("messages"),
    reply: v.string(),
  }),
  handler: async (
    ctx: AnyCtx,
  ): Promise<{ messageId: Id<"messages">; reply: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to call Felicia.");

    const notes = await ctx.runQuery(internal.felicia.notesFor, { userId });
    const memories = await ctx.runQuery(internal.felicia.topMemories, {
      userId,
    });

    const raw = await ctx.runAction(cloudflare.chat, {
      messages: [
        { role: "system", content: buildSystemPrompt(notes, memories) },
        {
          role: "user",
          content:
            "[[stage direction: the phone is ringing and you have just picked up. " +
            "Greet them the way you would answer mid-evening. One short spoken " +
            "sentence, under 20 words. Do not send a photo. Do not mention this " +
            "direction.]]",
        },
      ],
    });

    const reply =
      raw.replace(/\[\[[\s\S]*?\]\]/g, "").trim() || "Hey, you called.";

    const messageId = await ctx.runMutation(internal.felicia.saveMessage, {
      userId,
      role: "felicia",
      content: reply,
    });

    return { messageId, reply };
  },
});

// ---------------------------------------------------------------------------
// Shared photos
// ---------------------------------------------------------------------------

/**
 * Store a photo the user picked and let Felicia react to it.
 *
 * The model behind her is text-only, so she responds to the fact that a photo
 * arrived rather than to its contents — she says so naturally instead of
 * pretending to have seen it. The image itself is saved to Convex storage and
 * rendered in the conversation.
 */
export const sendUserPhoto = action<{ ctx: AnyCtx; args: { data: Uint8Array; mimeType: string } }>({
  args: { data: v.bytes(), mimeType: v.string() },
  returns: v.object({
    reply: v.string(),
    replyMessageId: v.id("messages"),
  }),
  handler: async (
    ctx: AnyCtx,
    { data, mimeType }: { data: Uint8Array; mimeType: string },
  ): Promise<{ reply: string; replyMessageId: Id<"messages"> }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to share a photo.");

    const bytes = new Uint8Array(data);

    if (bytes.byteLength > 6_000_000) {
      throw new Error("That photo is over 6 MB — try a smaller one.");
    }
    if (bytes.byteLength === 0) throw new Error("That photo is empty.");

    const storageId = await ctx.storage.store(
      new Blob([bytes], {
        type: /^image\/[a-z0-9.+-]+$/i.test(mimeType) ? mimeType : "image/jpeg",
      }),
    );

    await ctx.runMutation(internal.felicia.saveMessage, {
      userId,
      role: "user",
      content: "",
      imageStorageId: storageId,
    });

    const notes = await ctx.runQuery(internal.felicia.notesFor, { userId });
    const memories = await ctx.runQuery(internal.felicia.topMemories, {
      userId,
    });

    const raw = await ctx.runAction(cloudflare.chat, {
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(notes, memories),
        },
        {
          role: "user",
          content:
            "[[stage direction: they have just sent you a photo of themselves. " +
            "React to the fact that a photo arrived — one or two sentences, in " +
            "character, no stage directions. You cannot see the image, so talk " +
            "about having received it rather than describing its contents.]]",
        },
      ],
    });

    const reply =
      raw.replace(/\[\[[\s\S]*?\]\]/g, "").trim() ||
      "Just got it — give me a second.";

    const replyMessageId = await ctx.runMutation(internal.felicia.saveMessage, {
      userId,
      role: "felicia",
      content: reply,
    });

    return { reply, replyMessageId };
  },
});

// ---------------------------------------------------------------------------
// Mind map
// ---------------------------------------------------------------------------

/** Pull a JSON array out of a reply that may be wrapped in prose or code fences. */
function parseMemoryList(raw: string): Array<{
  title: string;
  category: string;
  content: string;
  strength: number;
}> {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const allowed = ["person", "place", "preference", "moment", "goal", "fact"];
  const out: Array<{
    title: string;
    category: string;
    content: string;
    strength: number;
  }> = [];

  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const content =
      typeof item.content === "string" ? item.content.trim() : "";
    if (!title || !content) continue;

    const category =
      typeof item.category === "string" &&
      allowed.includes(item.category.toLowerCase())
        ? item.category.toLowerCase()
        : "fact";
    const strength =
      typeof item.strength === "number" ? item.strength : 3;

    out.push({ title, category, content, strength: clampStrength(strength) });
    if (out.length >= 8) break;
  }
  return out;
}

/**
 * Ask Felicia to write down what she has learned about the two of you.
 *
 * The mind map is meant to be earned from conversation, so this reads the real
 * transcript and only adds facts that aren't already there. A malformed reply
 * yields zero new memories rather than an error — a model that rambles should
 * not break the page.
 */
export const captureMemories = action<{ ctx: AnyCtx; args: {} }>({
  args: {},
  returns: v.object({ added: v.number(), total: v.number() }),
  handler: async (
    ctx: AnyCtx,
  ): Promise<{ added: number; total: number }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in first.");

    const history = await ctx.runQuery(internal.felicia.recentMessages, {
      userId,
      limit: 60,
    });
    if (history.length < 8) {
      throw new Error(
        "There isn't much to remember yet — talk to her a little first.",
      );
    }

    const notes = await ctx.runQuery(internal.felicia.notesFor, { userId });
    const known = await ctx.runQuery(internal.felicia.memoryTitles, {
      userId,
    });
    const seen = new Set(known);

    const transcript = history
      .map(
        (message: { role: unknown; content: unknown }) =>
          `${message.role === "user" ? "Them" : "Felicia"}: ${message.content}`,
      )
      .filter((line: string) => !line.endsWith(": [...]"))
      .join("\n");

    const raw = await ctx.runAction(cloudflare.chat, {
      messages: [
        {
          role: "system",
          content:
            "You extract durable facts from conversations. Reply with JSON only — no prose, no code fences.",
        },
        {
          role: "user",
          content:
            "Extract up to 6 facts from this conversation between Felicia and " +
            "the person she is talking to. Only facts worth remembering weeks " +
            "later — people, places, preferences, moments, goals. Each must be " +
            "concrete and about these two people.\n\n" +
            'Reply with a JSON array, items shaped {"title": "2-6 words", ' +
            '"category": "person|place|preference|moment|goal|fact", ' +
            '"content": "3-18 words", "strength": 1-5}. Nothing else.\n\n' +
            "Already known, do not repeat:\n" +
            `${JSON.stringify(known)}\n\n` +
            `Shared Notes for context:\n${JSON.stringify(notes)}\n\n` +
            `Conversation:\n${transcript}`,
        },
      ],
    });

    const extracted = parseMemoryList(raw);
    let added = 0;

    for (const item of extracted) {
      const key = item.title.trim().toLowerCase();
      if (seen.has(key)) continue;
      await ctx.runMutation(internal.felicia.insertMemory, {
        userId,
        ...item,
      });
      seen.add(key);
      added += 1;
    }

    const total = await ctx.runQuery(internal.felicia.memoryCount, { userId });
    return { added, total };
  },
});
