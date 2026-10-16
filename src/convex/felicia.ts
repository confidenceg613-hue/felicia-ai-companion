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
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";

/**
 * Felicia — the companion layer.
 *
 * Everything the browser needs lives here: the conversation, the photos she has
 * sent, and the actions that reach out to external AI services:
 *   chat  → Groq chat completions
 *   speak → Cloudflare Workers AI voice models
 *   image → AI Horde
 * All of those are wired through the internal actions in `cloudflare.ts`.
 */

/** Used when a request has no usable scene description. */
export const DEFAULT_SCENE =
  "relaxing on a sunlit balcony at golden hour, wearing a soft linen shirt, holding a mug of coffee";

/** A deliberately plain scene used to retry after a safety-filter false positive. */
const FALLBACK_SCENE =
  "by a rain-streaked cafe window with a cup of coffee, wearing an oversized knit sweater, moody grey-blue light, elegant relaxed pose";

const MAX_MESSAGE_LENGTH = 2000;
const HISTORY_LIMIT = 16;

// ---------------------------------------------------------------------------
// Shared Notes
// ---------------------------------------------------------------------------

/** The notes actually handed to the model: stored values layered over defaults. */
function mergedNotes(stored: Record<string, string> | null | undefined) {
  return { ...DEFAULT_SHARED_NOTES, ...(stored ?? {}) };
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

  return [
    SYSTEM_PROMPT,
    `It is currently ${now} in Lisbon, where you are.`,
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
});

export const messages = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("asc")
      .take(300);

    return await Promise.all(
      rows.map(async (message) => ({
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
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("photos")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(60);
    return await Promise.all(
      rows.map(async (photo) => ({
        ...photo,
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
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { sections: DEFAULT_SHARED_NOTES, updatedAt: 0 };
    const row = await ctx.db
      .query("sharedNotes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!row) return { sections: DEFAULT_SHARED_NOTES, updatedAt: 0 };
    return {
      sections: { ...DEFAULT_SHARED_NOTES, ...row.sections },
      updatedAt: row.updatedAt,
    };
  },
});

/** Everything Felicia has remembered, most recently updated first. */
export const memories = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("memories")
      .withIndex("by_user_updated", (q) => q.eq("userId", userId))
      .order("desc")
      .take(200);
  },
});

// ---------------------------------------------------------------------------
// Internal persistence
// ---------------------------------------------------------------------------

export const recentMessages = internalQuery({
  args: { userId: v.id("users"), limit: v.number() },
  handler: async (ctx, { userId, limit }) => {
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
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
  handler: async (ctx, args) => {
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
  handler: async (ctx, { messageId }) => {
    const message = await ctx.db.get(messageId);
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
  handler: async (ctx, { messageId, audioStorageId }) => {
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
  handler: async (ctx, args) => {
    await ctx.db.insert("photos", { ...args, createdAt: Date.now() });
    return null;
  },
});

/** Shared Notes as the model sees them: stored sections over the defaults. */
export const notesFor = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const row = await ctx.db
      .query("sharedNotes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return mergedNotes(row?.sections);
  },
});

/** The facts Felicia keeps, handed to her prompt so the mind map is real. */
export const topMemories = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query("memories")
      .withIndex("by_user_updated", (q) => q.eq("userId", userId))
      .order("desc")
      .take(12);
    return rows.map((memory) => ({
      title: memory.title.slice(0, 70),
      content: memory.content.slice(0, 200),
    }));
  },
});

export const memoryTitles = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query("memories")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(300);
    return rows.map((memory) => memory.title.trim().toLowerCase());
  },
});

export const memoryCount = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query("memories")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(1);
    return rows.length;
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
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("memories", { ...args, createdAt: now, updatedAt: now });
    return null;
  },
});

/**
 * Facts from Felicia's own life, planted the first time the mind map opens.
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
    title: "Cafe Nove",
    category: "place",
    content: "The small coffee shop in Alfama where she works weekend shifts.",
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
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in first.");

    const existing = await ctx.db
      .query("memories")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(1);
    if (existing.length > 0) return null;

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
  handler: async (ctx, { sections }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to edit Shared Notes.");

    // Only the known sections are persisted, so a stray key can't grow unbounded.
    const cleaned: Record<string, string> = {};
    for (const section of SHARED_NOTE_SECTIONS) {
      cleaned[section.key] = (sections[section.key] ?? "").slice(0, 4000);
    }

    const existing = await ctx.db
      .query("sharedNotes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
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
  handler: async (ctx, args) => {
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
  handler: async (ctx, args) => {
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
  handler: async (ctx, { id }) => {
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
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to talk to Felicia.");
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(500);
    for (const row of rows) {
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
export const sendMessage = action({
  args: { text: v.string() },
  returns: v.object({
    reply: v.string(),
    photoScene: v.union(v.string(), v.null()),
    replyMessageId: v.id("messages"),
  }),
  handler: async (
    ctx,
    { text },
  ): Promise<{
    reply: string;
    photoScene: string | null;
    replyMessageId: Id<"messages">;
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

    const raw = await ctx.runAction(internal.cloudflare.chat, {
      messages: [
        { role: "system", content: buildSystemPrompt(notes, memories) },
        ...history.map((message) => ({
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

    return { reply, photoScene: scene, replyMessageId };
  },
});

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
export const generatePhoto = action({
  args: { scene: v.optional(v.string()) },
  returns: v.object({
    storageId: v.id("_storage"),
    url: v.union(v.string(), v.null()),
  }),
  handler: async (
    ctx,
    { scene },
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
        const attempt = await ctx.runAction(internal.cloudflare.generateImage, {
          prompt,
        });
        success = { prompt, storageId: attempt.storageId };
        break;
      } catch (error) {
        if (!isFilterError(error) && !isHordeFailureRetryable(error)) {
          throw error;
        }
      }
    }

    if (!success) {
      throw new Error(
        "Couldn't generate that photo right now — neither Nano Banana on " +
          "Cloudflare nor the AI Horde could deliver it. Try again in a moment.",
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
export const speakMessage = action({
  args: { messageId: v.id("messages") },
  returns: v.object({ url: v.union(v.string(), v.null()) }),
  handler: async (
    ctx,
    { messageId },
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

    const audio = await ctx.runAction(internal.cloudflare.speak, {
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
export const startCall = action({
  args: {},
  returns: v.object({
    messageId: v.id("messages"),
    reply: v.string(),
  }),
  handler: async (
    ctx,
  ): Promise<{ messageId: Id<"messages">; reply: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to call Felicia.");

    const notes = await ctx.runQuery(internal.felicia.notesFor, { userId });
    const memories = await ctx.runQuery(internal.felicia.topMemories, {
      userId,
    });

    const raw = await ctx.runAction(internal.cloudflare.chat, {
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
export const sendUserPhoto = action({
  args: { data: v.bytes(), mimeType: v.string() },
  returns: v.object({
    reply: v.string(),
    replyMessageId: v.id("messages"),
  }),
  handler: async (
    ctx,
    { data, mimeType },
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

    const raw = await ctx.runAction(internal.cloudflare.chat, {
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
export const captureMemories = action({
  args: {},
  returns: v.object({ added: v.number(), total: v.number() }),
  handler: async (
    ctx,
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
        (message) =>
          `${message.role === "user" ? "Them" : "Felicia"}: ${message.content}`,
      )
      .filter((line) => !line.endsWith(": [...]"))
      .join("\n");

    const raw = await ctx.runAction(internal.cloudflare.chat, {
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
