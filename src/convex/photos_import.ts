"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// Match the convention used everywhere else in this codebase: the handler
// context is typed as `any` so internal calls don't carry the full generic
// context shape across module boundaries.
type AnyCtx = any;
type AnyArgs = any;

// ---------------------------------------------------------------------------
// Internal action: import photos from a Google Photos share link.
// ---------------------------------------------------------------------------
//
// The client hands the app a public Google Photos share link
// (photos.app.goo.gl/...). This action fetches the share page's static HTML,
// reads the sized image URLs it contains (the og:image thumbnail plus any
// other pre-embed tile URLs Google put in the HTML), downloads each distinct
// photo at its best available resolution, and stores them in Convex file
// storage as rows in the `photos` table — so they show up in her album, the
// lightbox, and the conversation like any of her pictures.
//
// What it can reach: only the media URLs that Google puts in the static HTML
// of the share page. For albums that render the full grid through client-side
// JS (as most do), that is usually the og:image plus a handful of tile URLs —
// not the entire album. Getting every photo in an album needs either a real
// browser to run the page's JS or Google's authenticated Photos API, neither
// of which is available here. When that happens the action still imports
// whatever it could find and reports the count honestly.
//
// This has no browser dependency: Playwright/Chromium can't run in Convex's
// hosted Node runtime, so the whole flow uses plain fetch + regex.

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const SIZED_LH3_RE = /https:\/\/lh3\.googleusercontent\.com\/pw\/[A-Za-z0-9_-]+=w\d+-h\d+-[a-z0-9-]+/g;

// A "media id" is the part of the URL before the first size param (=w...).
// Stripping the size suffix groups every variant of one photo together.
function baseId(url: string): string {
  const i = url.indexOf("=w");
  return i === -1 ? url : url.slice(0, i);
}

// Width extracted from a =w<width>-... segment, 0 when absent.
function widthOf(url: string): number {
  const m = url.match(/=w(\d+)-/);
  return m ? parseInt(m[1], 10) : 0;
}

// Best available sized URL for one distinct photo: the variant with the
// largest width in the HTML. Larger width means higher resolution.
function bestUrl(urls: string[]): string {
  return urls.reduce((best, url) =>
    widthOf(url) > widthOf(best) ? url : best,
  );
}

function pickScene(title: string | null, ogTitle: string | null): string {
  const scene = ogTitle ?? title ?? "a shared Google Photos album";
  // Keep it a readable English description rather than raw markup.
  return scene.replace(/\s+/g, " ").trim();
}

function pickLabel(ogTitle: string | null): string {
  return (ogTitle ?? "GODWIN Confidence").replace(/\s+/g, " ").trim() +
    " — Google Photos";
}

// ---------------------------------------------------------------------------

export const addPhotosFromLink = internalAction({
  args: {
    link: v.string(),
    userId: v.id("users"),
  },
  handler: async (
    ctx: AnyCtx,
    { link, userId }: { link: string; userId: Id<"users"> },
  ) => {
    if (!link.startsWith("https://photos.app.goo.gl/")) {
      throw new Error(
        "Only a Google Photos share link (photos.app.goo.gl/...) is " +
          "supported right now.",
      );
    }

    // 1. Fetch the share page HTML (public, no auth needed for shared albums).
    let html = "";
    try {
      const response = await fetch(link, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      });
      if (!response.ok) {
        throw new Error(
          `Google Photos returned ${response.status} for that link.`,
        );
      }
      html = await response.text();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Couldn't fetch that Google Photos link: ${message}. The link may ` +
          `be private, expired, or Google may be blocking this request. ` +
          `Try a different link, or paste direct image URLs instead.`,
      );
    }

    if (html.length === 0) {
      throw new Error(
        "That Google Photos link came back empty — it may be private or " +
          "no longer public. Try a different link.",
      );
    }

    // 2. Read the og:title (e.g. "New video · Wednesday, Oct 21 🎬") and the
    //    page <title> ("Shared album - GODWIN Confidence - Google Photos") so
    //    the imported photos are labelled after what the album actually is.
    const ogTitle = extractMeta(html, "og:title") ?? null;
    const pageTitle = extractMeta(html, "title") ?? null;

    // 3. Find every sized lh3 image URL the static HTML contains.
    const raw = html.match(SIZED_LH3_RE) ?? [];
    const byBase = new Map<string, string[]>();
    for (const url of raw) {
      const id = baseId(url);
      if (!byBase.has(id)) byBase.set(id, []);
      byBase.get(id)!.push(url);
    }

    const distinct = [...byBase.keys()];
    if (distinct.length === 0) {
      throw new Error(
        "Opened the album but didn't find any sized photo URLs in it. " +
          "The album renders its grid through client-side JavaScript, so " +
          "this app can only import the thumbnail it embeds — and this " +
          "particular link didn't even include one in its static HTML. " +
          "Try pasting a direct image URL instead.",
      );
    }

    // 4. Download each distinct photo at its best available size, store it,
    //    and record it in her `photos` table.
    const scene = pickScene(pageTitle, ogTitle);
    const label = pickLabel(ogTitle);

    let stored = 0;
    const prompt =
      `Imported from a public Google Photos share link — ${label}. ` +
      `The thumbnail and any sized tiles Google embedded in the share ` +
      `page's static HTML were downloaded and saved exactly as they appeared ` +
      `in the album.`;

    for (const id of distinct) {
      const candidateUrls = byBase.get(id)!;
      const url = bestUrl(candidateUrls);
      let blob: Blob | null = null;
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": USER_AGENT, Accept: "image/*" },
        });
        if (!response.ok) continue;
        blob = await response.blob();
      } catch {
        continue;
      }
      if (!blob || blob.size === 0) continue;

      const storageId = await ctx.storage.store(
        new Blob([await blob.arrayBuffer()], { type: blob.type || "image/jpeg" }),
      );
      await ctx.runMutation(internal.felicia.savePhoto, {
        userId,
        storageId,
        url: null,
        scene,
        label,
        prompt,
      });
      stored += 1;
    }

    if (stored === 0) {
      throw new Error(
        "Downloaded the URLs but none of the images stored — every fetch " +
          "came back empty. The link's images may be blocked from this " +
          "network. Try again, or paste direct image URLs.",
      );
    }

    return { imported: stored };
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractMeta(html: string, property: string): string | null {
  // Matches both <meta property="og:title" content="..."> and
  // <meta property='og:title' content='...'>, case-insensitive.
  const re = new RegExp(
    `<meta[^>]+(?:property|content)=["']${escapeMeta(property)}["'][^>]+content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${escapeMeta(property)}["']`,
    "i",
  );
  const m = html.match(re);
  return m ? (m[1] || m[2]) : null;
}

function escapeMeta(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
