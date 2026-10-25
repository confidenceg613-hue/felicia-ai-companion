import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { FELICIA_APPEARANCE_DEFAULT } from "../lib/felicia";
import { FELICIA_GALLERY, galleryOriginal } from "../lib/gallery";
import { internalQuery, mutation, query } from "./_generated/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCtx = any;

/** The picture she has until an account chooses one of its own. */
const FELICIA_AVATAR_DEFAULT_ID = "portrait-soft-light";

/** Where the user's chosen outfit / background / custom scene live. */
export const feliciaAppearance = query({
  args: {},
  handler: async (ctx: AnyCtx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const row = await ctx.db
      .query("feliciaAppearance")
      .withIndex("by_user", (q: { eq: (key: string, value: string) => unknown }) => q.eq("userId", userId))
      .unique();

    if (!row) return null;
    const rowTyped = row as { appearance: { outfitKey: string; backgroundKey: string; overrideScene?: string | null } } | null;
    if (!rowTyped) return null;
    return rowTyped.appearance;
  },
});

/**
 * Which of her gallery photos is her profile picture.
 *
 * The choice is per account and lives beside her appearance, and null means
 * "the default portrait" — so a fresh account looks exactly like the app
 * before this was configurable.
 */
export const profile = query({
  args: {},
  handler: async (ctx: AnyCtx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const row = (await ctx.db
      .query("feliciaAppearance")
      .withIndex("by_user", (q: { eq: (key: string, value: string) => unknown }) => q.eq("userId", userId))
      .unique()) as { avatarGalleryId?: string | null } | null;

    return { avatarGalleryId: row?.avatarGalleryId ?? null };
  },
});

/**
 * Use one of her gallery photos as her profile picture.
 *
 * The id is checked against her real gallery before it is stored, so a typo or
 * a stale id can never point the avatar at a picture that doesn't exist.
 */
export const setProfilePhoto = mutation({
  args: { galleryId: v.string() },
  handler: async (ctx: AnyCtx, { galleryId }: { galleryId: string }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in first.");

    const known = FELICIA_GALLERY.some((photo) => photo.id === galleryId);
    if (!known) throw new Error("That isn't one of her photos.");

    const existing = await ctx.db
      .query("feliciaAppearance")
      .withIndex("by_user", (q: { eq: (key: string, value: string) => unknown }) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { avatarGalleryId: galleryId });
    } else {
      await ctx.db.insert("feliciaAppearance", {
        userId,
        appearance: FELICIA_APPEARANCE_DEFAULT,
        avatarGalleryId: galleryId,
      });
    }
  },
});

/**
 * Her profile picture, as the full-size file a model can be shown.
 *
 * This is what every new photo of her is drawn against: whichever picture is
 * on her profile is the face she keeps, so the avatar is not decoration — it
 * is her identity. The default portrait is used until the account picks
 * another one.
 */
export const avatarOriginal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx: AnyCtx, { userId }: { userId: string }) => {
    const row = (await ctx.db
      .query("feliciaAppearance")
      .withIndex("by_user", (q: { eq: (key: string, value: string) => unknown }) => q.eq("userId", userId))
      .unique()) as { avatarGalleryId?: string | null } | null;

    const id = row?.avatarGalleryId ?? FELICIA_AVATAR_DEFAULT_ID;
    return galleryOriginal(id) ?? galleryOriginal(FELICIA_AVATAR_DEFAULT_ID);
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
  handler: async (ctx: AnyCtx, { appearance }: { appearance: { outfitKey: string; backgroundKey: string; overrideScene?: string | null } }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in first.");

    const existing = await ctx.db
      .query("feliciaAppearance")
      .withIndex("by_user", (q: { eq: (key: string, value: string) => unknown }) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { appearance });
    } else {
      await ctx.db.insert("feliciaAppearance", { userId, appearance });
    }
  },
});
