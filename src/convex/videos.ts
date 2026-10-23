/**
 * Videos in her gallery.
 *
 * A clip is uploaded straight from the browser into this account's Convex
 * storage — it never passes through an action — and one `galleryVideos` row is
 * what makes it part of the album. Everything here is scoped to the signed-in
 * user, so a video you add is yours and nobody else's.
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { FELICIA_APPEARANCE_DEFAULT } from "../lib/felicia";
import { internalMutation, mutation, query } from "./_generated/server";

// The rest of this codebase types the Convex context loosely, so these follow
// the same convention rather than fighting the generated types.
type AnyCtx = any;
type AnyArgs = any;

/** How many clips her gallery holds before one has to go. */
const VIDEO_LIMIT = 24;
/** Matches MAX_VIDEO_MB on the client; checked again after the upload lands. */
const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
/**
 * Her gallery takes clips up to five minutes. Matches MAX_VIDEO_SECONDS on the
 * client, which reads the length before uploading; this is the check that
 * counts, because the browser's word for it is only a courtesy.
 */
const MAX_VIDEO_SECONDS = 300;

/** Every video in her gallery, newest first, with a URL the browser can play. */
export const list = query({
  args: {},
  handler: async (ctx: AnyCtx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const rows = await ctx.db
      .query("galleryVideos")
      .withIndex("by_user", (q: { eq: (key: string, value: string) => unknown }) =>
        q.eq("userId", userId),
      )
      .order("desc")
      .take(VIDEO_LIMIT);

    const resolved = await Promise.all(
      (rows as Array<{ _id: string; title: string; storageId: string; createdAt: number }>).map(
        async (row) => {
          const url = await ctx.storage.getUrl(row.storageId);
          if (!url) return null;
          return {
            _id: row._id,
            title: row.title,
            url,
            createdAt: row.createdAt,
          };
        },
      ),
    );

    return resolved.filter((row) => row !== null);
  },
});

/**
 * A one-hour URL the browser can POST a file to.
 *
 * Signing in is the whole gate: an anonymous visitor has no gallery to add to.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx: AnyCtx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to add a video to her gallery.");
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Turn an uploaded file into a gallery video.
 *
 * The file has already been stored by the time this runs, so a rejected upload
 * is deleted rather than left orphaned in storage. The size and type are
 * checked here as well as on the client: the client check saves a pointless
 * upload, this one is the one that counts.
 */
export const save = mutation({
  args: {
    storageId: v.id("_storage"),
    title: v.string(),
    // The clip's length as the browser read it. Optional so an older client
    // still works, but sent by ours on every upload.
    durationSeconds: v.optional(v.number()),
  },
  handler: async (ctx: AnyCtx, args: AnyArgs) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      await ctx.storage.delete(args.storageId);
      throw new Error("Sign in to add a video to her gallery.");
    }

    const file = (await ctx.db.system.get(args.storageId)) as {
      contentType?: string;
      size: number;
    } | null;
    if (!file) throw new Error("That upload didn't arrive. Try again.");

    if (!file.contentType?.startsWith("video/")) {
      await ctx.storage.delete(args.storageId);
      throw new Error("That file isn't a video. Pick an MP4, MOV or WebM.");
    }

    if (file.size > MAX_VIDEO_BYTES) {
      await ctx.storage.delete(args.storageId);
      throw new Error("That video is over 1 GB. Trim it down to fit.");
    }

    // A few seconds of slack: some containers report their length a touch
    // longer than the clip actually runs, and rejecting a 5:02 video that
    // plays for exactly five minutes would be mean, not tidy.
    if (
      typeof args.durationSeconds === "number" &&
      args.durationSeconds > MAX_VIDEO_SECONDS + 15
    ) {
      await ctx.storage.delete(args.storageId);
      throw new Error(
        "That clip runs longer than 5 minutes. Trim it to 5 minutes or under.",
      );
    }

    const existing = await ctx.db
      .query("galleryVideos")
      .withIndex("by_user", (q: { eq: (key: string, value: string) => unknown }) =>
        q.eq("userId", userId),
      )
      .take(VIDEO_LIMIT);

    if (existing.length >= VIDEO_LIMIT) {
      await ctx.storage.delete(args.storageId);
      throw new Error(
        `Her gallery holds ${VIDEO_LIMIT} videos. Remove one to add another.`,
      );
    }

    const title = String(args.title).trim().slice(0, 80) || "Her video";
    const createdAt = Date.now();
    const id = await ctx.db.insert("galleryVideos", {
      userId,
      storageId: args.storageId,
      title,
      createdAt,
    });

    return {
      _id: id,
      title,
      url: await ctx.storage.getUrl(args.storageId),
      createdAt,
    };
  },
});

/**
 * File a video that was downloaded server-side (a Google Photos share link)
 * rather than uploaded from the browser.
 *
 * The file is already in storage, so the checks here are the last chance to
 * reject it: wrong type or too large, and the blob is deleted instead of
 * being left behind.
 */
export const saveImported = internalMutation({
  args: {
    userId: v.id("users"),
    storageId: v.id("_storage"),
    title: v.string(),
  },
  handler: async (ctx: AnyCtx, args: AnyArgs) => {
    const file = (await ctx.db.system.get(args.storageId)) as {
      contentType?: string;
      size: number;
    } | null;
    if (!file) throw new Error("That download didn't arrive. Try again.");

    if (!file.contentType?.startsWith("video/")) {
      await ctx.storage.delete(args.storageId);
      throw new Error("That link didn't contain a video.");
    }
    if (file.size > MAX_VIDEO_BYTES) {
      await ctx.storage.delete(args.storageId);
      throw new Error("That video is over 1 GB — too big for her gallery.");
    }

    const existing = await ctx.db
      .query("galleryVideos")
      .withIndex("by_user", (q: { eq: (key: string, value: string) => unknown }) =>
        q.eq("userId", args.userId),
      )
      .take(VIDEO_LIMIT);
    if (existing.length >= VIDEO_LIMIT) {
      await ctx.storage.delete(args.storageId);
      throw new Error(
        `Her gallery holds ${VIDEO_LIMIT} videos. Remove one to add another.`,
      );
    }

    const title = String(args.title).trim().slice(0, 80) || "Her video";
    const duplicate = (existing as Array<{ title: string }>).some(
      (row) => row.title === title,
    );
    if (duplicate) {
      await ctx.storage.delete(args.storageId);
      throw new Error("That one is already in her gallery.");
    }

    await ctx.db.insert("galleryVideos", {
      userId: args.userId,
      storageId: args.storageId,
      title,
      createdAt: Date.now(),
    });
    return null;
  },
});

/**
 * The clip her camera plays by itself.
 *
 * Her camera feed used to be a still picture, brought to life in the browser.
 * When a gallery video is chosen here, that clip plays in its place — looping,
 * muted, the way a webcam feed would. Null means "use the picture instead",
 * which is what a fresh account gets.
 *
 * The row is stored beside her appearance and is per account, so two people
 * signed into the same deployment each see the video they picked.
 */
export const hero = query({
  args: {},
  handler: async (ctx: AnyCtx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const row = (await ctx.db
      .query("feliciaAppearance")
      .withIndex("by_user", (q: { eq: (key: string, value: string) => unknown }) =>
        q.eq("userId", userId),
      )
      .unique()) as { heroVideoId?: string } | null;
    if (!row?.heroVideoId) return null;

    const video = (await ctx.db.get(row.heroVideoId)) as {
      userId: string;
      title: string;
      storageId: string;
    } | null;
    // A video removed from the gallery leaves a stale id behind; that is not an
    // error, it just means she goes back to her picture.
    if (!video || video.userId !== userId) return null;

    const url = await ctx.storage.getUrl(video.storageId);
    if (!url) return null;

    return { _id: row.heroVideoId, title: video.title, url };
  },
});

/** Choose which gallery video auto-plays on her camera. */
export const setHero = mutation({
  args: { id: v.id("galleryVideos") },
  handler: async (ctx: AnyCtx, { id }: { id: string }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to change her gallery.");

    const video = (await ctx.db.get(id)) as { userId: string } | null;
    if (!video || video.userId !== userId) {
      throw new Error("That video isn't in your gallery.");
    }

    const existing = await ctx.db
      .query("feliciaAppearance")
      .withIndex("by_user", (q: { eq: (key: string, value: string) => unknown }) =>
        q.eq("userId", userId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { heroVideoId: id });
    } else {
      await ctx.db.insert("feliciaAppearance", {
        userId,
        appearance: FELICIA_APPEARANCE_DEFAULT,
        heroVideoId: id,
      });
    }
    return null;
  },
});

/** Go back to her picture instead of a clip. */
export const clearHero = mutation({
  args: {},
  handler: async (ctx: AnyCtx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to change her gallery.");

    const existing = await ctx.db
      .query("feliciaAppearance")
      .withIndex("by_user", (q: { eq: (key: string, value: string) => unknown }) =>
        q.eq("userId", userId),
      )
      .unique();
    if (!existing) return null;

    await ctx.db.patch(existing._id, { heroVideoId: undefined });
    return null;
  },
});

/** Take a video out of her gallery, file and all. */
export const remove = mutation({
  args: { id: v.id("galleryVideos") },
  handler: async (ctx: AnyCtx, args: AnyArgs) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to change her gallery.");

    const row = (await ctx.db.get(args.id)) as {
      userId: string;
      storageId: string;
    } | null;
    if (!row || row.userId !== userId) {
      throw new Error("That video isn't in your gallery.");
    }

    await ctx.storage.delete(row.storageId);
    await ctx.db.delete(args.id);
  },
});
