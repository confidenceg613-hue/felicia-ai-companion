"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// Match the convention used everywhere else in this codebase: the handler
// context is typed as `any` so internal calls don't carry the full generic
// context shape across module boundaries.
type AnyCtx = any;

// ---------------------------------------------------------------------------
// Internal action: bring a public Google Photos share link into her gallery.
// ---------------------------------------------------------------------------
//
// A share link is fetched once, and what it turns out to hold decides where it
// goes:
//
// - a single shared video carries `og:video`, an mp4 the app can download. It
//   is stored in Convex file storage and filed as a gallery video, so it plays
//   in her album next to the clips uploaded by hand.
// - an album carries thumbnail image URLs. Those are downloaded and recorded
//   as photos she has sent this user, so they show up in the album, the
//   lightbox and the conversation like any of her pictures.
//
// Only what Google puts in the share page's static HTML is reachable: no
// browser runs here, and the authenticated Photos API is not available. Single
// media shares always include their media, which covers the common case; grids
// rendered entirely by JavaScript give up just the photos they embed.

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const SHARE_LINK = /^https:\/\/(photos\.app\.goo\.gl|photos\.google\.com)\/\S+$/;

/** Most photos one album import may bring in, so the action stays bounded. */
const PHOTO_LIMIT = 12;

const SIZED_LH3_RE =
  /https:\/\/lh3\.googleusercontent\.com\/pw\/[A-Za-z0-9_-]+=w\d+-h\d+-[a-z0-9-]+/g;

/** A size variant that matches 16:9; Google serves the original regardless. */
function largeVariant(url: string): string {
  return url.replace(/=w\d+-h\d+-/, "=w1280-h720-");
}

function widthOf(url: string): number {
  const match = url.match(/=w(\d+)-/);
  return match ? parseInt(match[1], 10) : 0;
}

function baseId(url: string): string {
  const i = url.indexOf("=w");
  return i === -1 ? url : url.slice(0, i);
}

function tidy(value: string | null): string | null {
  if (!value) return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

function extractMeta(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']` +
      `|<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`,
    "i",
  );
  const match = html.match(re);
  return match ? (match[1] ?? match[2] ?? null) : null;
}

async function download(url: string, accept: string): Promise<Blob | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: accept },
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

export const importFromLink = internalAction({
  args: {
    link: v.string(),
    userId: v.id("users"),
  },
  handler: async (
    ctx: AnyCtx,
    { link, userId }: { link: string; userId: Id<"users"> },
  ): Promise<{ photos: number; videos: number }> => {
    if (!SHARE_LINK.test(link)) {
      throw new Error(
        "That isn't a Google Photos share link. Copy the link from Photos → Share and paste it here.",
      );
    }

    let html = "";
    try {
      const response = await fetch(link, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
        redirect: "follow",
      });
      if (!response.ok) {
        throw new Error(`Google Photos answered ${response.status}.`);
      }
      html = await response.text();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Couldn't open that link (${message}). It may be private, expired, or blocked — check that anyone with the link can view it.`,
      );
    }

    const title =
      tidy(extractMeta(html, "og:title")) ??
      tidy(extractMeta(html, "title")) ??
      "Shared from Google Photos";

    // ---------------------------------------------------------------- video
    const videoUrl = extractMeta(html, "og:video");
    if (videoUrl) {
      const video = await download(largeVariant(videoUrl), "video/*");
      if (!video) {
        throw new Error(
          "Found the video in that link but Google wouldn't hand it over. Try a different link.",
        );
      }
      const storageId = await ctx.storage.store(
        new Blob([await video.arrayBuffer()], {
          type: video.type || "video/mp4",
        }),
      );
      await ctx.runMutation(internal.videos.saveImported, {
        userId,
        storageId,
        title: title.slice(0, 80),
      });
      return { photos: 0, videos: 1 };
    }

    // --------------------------------------------------------------- photos
    const raw = html.match(SIZED_LH3_RE) ?? [];
    const byBase = new Map<string, string[]>();
    for (const url of raw) {
      const id = baseId(url);
      const known = byBase.get(id);
      if (known) known.push(url);
      else byBase.set(id, [url]);
    }

    const scene = `Imported from a shared Google Photos album — ${title}`;
    const prompt = `Imported from a public Google Photos share link: ${link}`;
    let photos = 0;

    for (const urls of byBase.values()) {
      if (photos >= PHOTO_LIMIT) break;
      const biggest = urls.reduce((best, url) =>
        widthOf(url) > widthOf(best) ? url : best,
      );
      const image = await download(largeVariant(biggest), "image/*");
      if (!image) continue;

      const storageId = await ctx.storage.store(
        new Blob([await image.arrayBuffer()], {
          type: image.type || "image/jpeg",
        }),
      );
      await ctx.runMutation(internal.felicia.savePhoto, {
        userId,
        storageId,
        url: null,
        scene,
        label: title,
        prompt,
      });
      photos += 1;
    }

    if (photos === 0) {
      throw new Error(
        "Opened that link but it held no media this app can read. Single photos and videos work; a full album usually only exposes its cover picture. Try the share link for one item instead.",
      );
    }

    return { photos, videos: 0 };
  },
});
