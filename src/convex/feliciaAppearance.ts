import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/** Where the user's chosen outfit / background / custom scene live. */
export const feliciaAppearance = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const row = await ctx.db
      .query("feliciaAppearance")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (!row) return null;
    return row.appearance;
  },
});

export const saveFeliciaAppearance = mutation({
  args: {
    appearance: v.object({
      outfitKey: v.string(),
      backgroundKey: v.string(),
      overrideScene: v.optional(v.union(v.string(), v.null())),
    }),
  },
  handler: async (ctx, { appearance }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in first.");

    const existing = await ctx.db
      .query("feliciaAppearance")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { appearance });
    } else {
      await ctx.db.insert("feliciaAppearance", { userId, appearance });
    }
  },
});
