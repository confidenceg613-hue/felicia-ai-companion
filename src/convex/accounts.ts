import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

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
    const to = await ctx.db.get(toUserId);
    if (!from) throw new Error("That guest conversation no longer exists.");
    if (from.isAnonymous !== true) {
      throw new Error("Only a guest conversation can be claimed.");
    }
    if (!to || to.isAnonymous === true) {
      throw new Error("Finish signing in with your email first.");
    }

    let moved = 0;

    // One-to-many tables: the rows themselves move. Pages of 200 keep the
    // mutation bounded — a guest conversation is by nature small, and the cap
    // means a runaway history can never fail the write. Whatever sits beyond
    // it stays under the guest id rather than being lost or half-moved.
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_user", (q) => q.eq("userId", fromUserId))
      .take(200);
    for (const row of messages) {
      await ctx.db.patch(row._id, { userId: toUserId });
      moved += 1;
    }

    const photos = await ctx.db
      .query("photos")
      .withIndex("by_user", (q) => q.eq("userId", fromUserId))
      .take(200);
    for (const row of photos) {
      await ctx.db.patch(row._id, { userId: toUserId });
      moved += 1;
    }

    const memories = await ctx.db
      .query("memories")
      .withIndex("by_user", (q) => q.eq("userId", fromUserId))
      .take(200);
    for (const row of memories) {
      await ctx.db.patch(row._id, { userId: toUserId });
      moved += 1;
    }

    const chapters = await ctx.db
      .query("chapters")
      .withIndex("by_user", (q) => q.eq("userId", fromUserId))
      .take(200);
    for (const row of chapters) {
      await ctx.db.patch(row._id, { userId: toUserId });
      moved += 1;
    }

    // One-row-per-account tables: the signed-in account's own copy wins, and
    // the guest's is only carried over when there is nothing to clash with.
    await moveSharedNotes(ctx, fromUserId, toUserId, () => (moved += 1));
    await moveAppearance(ctx, fromUserId, toUserId, () => (moved += 1));

    return null;
  },
});

/** Shared Notes: one row per account, so the target's copy wins if it exists. */
async function moveSharedNotes(
  ctx: MutationCtx,
  fromUserId: Id<"users">,
  toUserId: Id<"users">,
  onMove: () => void,
): Promise<void> {
  const guest = await ctx.db
    .query("sharedNotes")
    .withIndex("by_user", (q) => q.eq("userId", fromUserId))
    .unique();
  if (!guest) return;
  const own = await ctx.db
    .query("sharedNotes")
    .withIndex("by_user", (q) => q.eq("userId", toUserId))
    .unique();
  if (own) return;
  await ctx.db.patch(guest._id, { userId: toUserId });
  onMove();
}

/** The saved look: likewise a single row per account. */
async function moveAppearance(
  ctx: MutationCtx,
  fromUserId: Id<"users">,
  toUserId: Id<"users">,
  onMove: () => void,
): Promise<void> {
  const guest = await ctx.db
    .query("feliciaAppearance")
    .withIndex("by_user", (q) => q.eq("userId", fromUserId))
    .unique();
  if (!guest) return;
  const own = await ctx.db
    .query("feliciaAppearance")
    .withIndex("by_user", (q) => q.eq("userId", toUserId))
    .unique();
  if (own) return;
  await ctx.db.patch(guest._id, { userId: toUserId });
  onMove();
}