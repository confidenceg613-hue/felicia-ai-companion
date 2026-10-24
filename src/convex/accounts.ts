import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/** How far back an earlier guest session is still worth folding back in. */
const RESTORE_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;
/**
 * How many recent rows the scan reads, and how many earlier guest sessions it
 * will fold in. Both are generous because a person's history is spread over
 * every guest session they ever started, and a missed session is a lost
 * conversation — the tables themselves are small by nature.
 */
const RESTORE_SCAN = 600;
/** Clips and photos are much heavier rows, so their window is smaller. */
const RESTORE_MEDIA_SCAN = 200;
const RESTORE_MAX_SESSIONS = 60;

/** One earlier guest account, and what is sitting under it. */
type EarlierGuest = {
  id: Id<"users">;
  messages: number;
  videos: number;
  newest: number;
  oldest: number;
};

/**
 * Bind a guest conversation to the account that just signed in.
 *
 * A guest's history lives under their anonymous user id. When they then sign
 * in with email, Convex Auth issues the email user's session and the anonymous
 * id would be orphaned — so the client hands us that id once, right after the
 * sign-in resolves, and the conversation's rows move across.
 *
 * The guard: only an *anonymous* account can be claimed. There is no way to
 * take a signed-in account's history through this mutation, and nothing is
 * ever deleted — if a move can't happen it throws, and the data stays put.
 */
export const claimGuestConversation = mutation({
  args: { fromUserId: v.id("users") },
  returns: v.null(),
  handler: async (
    ctx: MutationCtx,
    { fromUserId }: { fromUserId: Id<"users"> },
  ): Promise<null> => {
    const toUserId = await getAuthUserId(ctx);
    if (!toUserId) throw new Error("Sign in first.");
    if (toUserId === fromUserId) throw new Error("That is already you.");

    const from = await ctx.db.get(fromUserId);
    if (!from) throw new Error("That guest conversation no longer exists.");
    if (from.isAnonymous !== true) {
      throw new Error("Only a guest conversation can be claimed.");
    }

    await moveAccountData(ctx, fromUserId, toUserId);
    return null;
  },
});

/**
 * Where the app was used before this account existed.
 *
 * A guest session lives in the browser, and the address this app is opened on
 * changes between preview links and published links — so the same person keeps
 * arriving as a brand-new guest with an empty chat, while every earlier
 * conversation stays in the database under the guest id that created it.
 *
 * This reports whether such earlier sessions exist, so the empty chat can
 * offer to bring them back instead of pretending the history is gone. It is
 * only offered to an account with no messages of its own, and it reads at most
 * one page of recent messages.
 */
export const earlierSessions = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
    const userId = await getAuthUserId(ctx);
    const empty = {
      sessions: 0,
      messages: 0,
      videos: 0,
      newest: null as number | null,
      oldest: null as number | null,
    };
    if (!userId) return empty;

    // Nothing is missing if this account already talks.
    const own = await ctx.db
      .query("messages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(1);
    if (own.length > 0) return empty;

    const guests = await earlierGuests(ctx, userId);
    let messages = 0;
    let videos = 0;
    let newest: number | null = null;
    let oldest: number | null = null;
    for (const guest of guests) {
      messages += guest.messages;
      videos += guest.videos;
      newest = newest === null ? guest.newest : Math.max(newest, guest.newest);
      oldest = oldest === null ? guest.oldest : Math.min(oldest, guest.oldest);
    }

    return { sessions: guests.length, messages, videos, newest, oldest };
  },
});

/**
 * Fold those earlier guest sessions into the signed-in account.
 *
 * Everything is moved, nothing is copied or deleted, so the whole transcript
 * re-forms with its original timestamps — the conversation reads as continuous
 * because it is.
 */
export const restoreEarlierSessions = mutation({
  args: {},
  handler: async (ctx: MutationCtx) => {
    const toUserId = await getAuthUserId(ctx);
    if (!toUserId) throw new Error("Sign in first.");

    const guests = await earlierGuests(ctx, toUserId);
    let sessions = 0;
    let moved = 0;
    for (const guest of guests) {
      moved += await moveAccountData(ctx, guest.id, toUserId);
      sessions += 1;
    }

    return { sessions, moved };
  },
});

/**
 * The guest accounts that hold something worth bringing back.
 *
 * Candidates come from the transcript, the clips in her gallery and the photos
 * she sent. A guest who only ever uploaded a few videos and never typed a
 * message has no transcript at all — scanning messages alone would report
 * nothing to restore and leave those clips stranded under an id nobody is
 * signed in as any more.
 */
async function earlierGuests(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<EarlierGuest[]> {
  const cutoff = Date.now() - RESTORE_WINDOW_MS;
  const guests = new Map<Id<"users">, EarlierGuest>();

  function note(id: Id<"users">, at: number): EarlierGuest {
    const existing = guests.get(id);
    if (existing) {
      existing.newest = Math.max(existing.newest, at);
      existing.oldest = Math.min(existing.oldest, at);
      return existing;
    }
    const fresh: EarlierGuest = {
      id,
      messages: 0,
      videos: 0,
      newest: at,
      oldest: at,
    };
    guests.set(id, fresh);
    return fresh;
  }

  const messages = await ctx.db.query("messages").order("desc").take(RESTORE_SCAN);
  for (const message of messages) {
    if (message.userId === userId || message.createdAt < cutoff) continue;
    if (!guests.has(message.userId) && guests.size >= RESTORE_MAX_SESSIONS) continue;
    note(message.userId, message.createdAt).messages += 1;
  }

  const videos = await ctx.db
    .query("galleryVideos")
    .order("desc")
    .take(RESTORE_MEDIA_SCAN);
  for (const video of videos) {
    if (video.userId === userId || video.createdAt < cutoff) continue;
    if (!guests.has(video.userId) && guests.size >= RESTORE_MAX_SESSIONS) continue;
    note(video.userId, video.createdAt).videos += 1;
  }

  const photos = await ctx.db.query("photos").order("desc").take(RESTORE_MEDIA_SCAN);
  for (const photo of photos) {
    if (photo.userId === userId || photo.createdAt < cutoff) continue;
    if (!guests.has(photo.userId) && guests.size >= RESTORE_MAX_SESSIONS) continue;
    note(photo.userId, photo.createdAt);
  }

  // Only a guest can be folded in: a signed-in account's history is its own.
  const out: EarlierGuest[] = [];
  for (const guest of guests.values()) {
    const owner = await ctx.db.get(guest.id);
    if (owner?.isAnonymous !== true) continue;
    out.push(guest);
  }
  return out;
}

/**
 * Move one account's history onto another.
 *
 * Pages of 200 keep every table bounded — a conversation is small by nature,
 * and the cap means a runaway history can never fail the write. Whatever sits
 * beyond it stays under the original id rather than being lost or half-moved.
 */
async function moveAccountData(
  ctx: MutationCtx,
  fromUserId: Id<"users">,
  toUserId: Id<"users">,
): Promise<number> {
  let moved = 0;

  /** One-to-many tables: the rows themselves move. */
  async function moveRows(
    table: "messages" | "photos" | "memories" | "chapters" | "galleryVideos",
  ) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_user", (q) => q.eq("userId", fromUserId))
      .take(200);
    for (const row of rows) {
      await ctx.db.patch(row._id, { userId: toUserId });
      moved += 1;
    }
  }

  await moveRows("messages");
  await moveRows("photos");
  await moveRows("memories");
  await moveRows("chapters");
  await moveRows("galleryVideos");

  // One-row-per-account tables: the signed-in account's own copy wins, and the
  // guest's is only carried over when there is nothing to clash with.
  const guestNotes = await ctx.db
    .query("sharedNotes")
    .withIndex("by_user", (q) => q.eq("userId", fromUserId))
    .unique();
  if (guestNotes) {
    const own = await ctx.db
      .query("sharedNotes")
      .withIndex("by_user", (q) => q.eq("userId", toUserId))
      .unique();
    if (!own) {
      await ctx.db.patch(guestNotes._id, { userId: toUserId });
      moved += 1;
    }
  }

  const guestLook = await ctx.db
    .query("feliciaAppearance")
    .withIndex("by_user", (q) => q.eq("userId", fromUserId))
    .unique();
  if (guestLook) {
    const own = await ctx.db
      .query("feliciaAppearance")
      .withIndex("by_user", (q) => q.eq("userId", toUserId))
      .unique();
    if (!own) {
      await ctx.db.patch(guestLook._id, { userId: toUserId });
      moved += 1;
    }
  }

  const guestPrefs = await ctx.db
    .query("companionPrefs")
    .withIndex("by_user", (q) => q.eq("userId", fromUserId))
    .unique();
  if (guestPrefs) {
    const own = await ctx.db
      .query("companionPrefs")
      .withIndex("by_user", (q) => q.eq("userId", toUserId))
      .unique();
    if (!own) {
      await ctx.db.patch(guestPrefs._id, { userId: toUserId });
      moved += 1;
    }
  }

  return moved;
}
