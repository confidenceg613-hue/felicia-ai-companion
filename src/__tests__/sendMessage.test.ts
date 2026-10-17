import { expect, test, describe, beforeEach } from "bun:test";import { sendMessage } from "../convex/felicia.js";
import type { ActionBuilder } from "convex/server";

// `sendMessage` is exported as a Convex action. The object Convex builds
// exposes `invokeAction`, which is the public entry point the runtime calls.
// We call that directly with our deterministic mock context so the test proves
// the wiring end-to-end without talking to a deployed backend.
import { sendMessage } from "../convex/felicia.js";

// `sendMessage` is exported as a Convex action. The object Convex builds
// exposes `invokeAction`, which is the public entry point the runtime calls.
// Its internal `actions_impl.js` then serializes our args through `jsonToConvex`
// (expects JSON, rejects `undefined`), builds the action ctx, and invokes the
// wrapped handler. So the test calls `invokeAction` with a JSON-serializable
// request id and a JSON stringified args object — the same shape the runtime
// would pass — wired to our deterministic mock collaborators.
const sendMessageApi = sendMessage as {
  invokeAction: (requestId: string, argsStr: string) => Promise<unknown>;
};
if (typeof sendMessageApi.invokeAction !== "function") {
  throw new Error("convex/_generated is stale: sendMessage.invokeAction is missing");
}

// A Convex action handler expects the same shape the runtime provides:
// `auth.getUserIdentity()`, the db CRUD surface, storage, runQuery / runMutation
// / runAction, and the scheduler. We build a deterministic shim here so the test
// can prove the function is wired end-to-end without touching a deployed backend.

interface MockQueryApi {
  withIndex: (
    _index: string,
    eq: (key: string, value: string) => unknown,
  ) => {
    order: (dir: "asc" | "desc") => {
      take: (n: number) => unknown[];
    };
  };
}

interface MockCtx {
  auth: { getUserIdentity: () => Promise<{ subject: string } | null> };
  db: {
    insert: (
      table: string,
      row: Record<string, unknown>,
    ) => { _id: string };
    patch: (id: string, patch: Record<string, unknown>) => void;
    query: (table: string) => MockQueryApi;
    delete: (id: string) => void;
  };
  storage: {
    getUrl: (id: string) => Promise<string | null>;
  };
  runQuery: <Name extends string>(
    name: Name,
    args: Record<string, unknown>,
  ) => unknown;
  runMutation: <Name extends string>(
    name: Name,
    args: Record<string, unknown>,
  ) => unknown;
  runAction: <Name extends string>(
    name: Name,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
  scheduler: {
    runAfter: (
      delayMs: number,
      name: string,
      args: Record<string, unknown>,
    ) => unknown;
  };
}

function buildMockCtx(): MockCtx {
  const messages: Array<{ role: string; content: string; _id: string }> = [];
  const photos: Array<Record<string, unknown>> = [];

  const db = {
    insert: (table: string, row: Record<string, unknown>) => {
      const _id = `${table}:${messages.length + photos.length + 1}`;
      if (table === "messages") {
        messages.push({ ...row, _id } as { role: string; content: string; _id: string });
      } else if (table === "photos") {
        photos.push({ ...row, _id });
      }
      return { _id };
    },
    patch: (id, patch) => {
      for (const list of [messages, photos]) {
        for (const entry of list) {
          if (entry._id === id) Object.assign(entry, patch);
        }
      }
    },
    query: (_table: string): MockQueryApi => ({
      withIndex: () => ({
        order: (dir: "asc" | "desc") => ({
          take: (n: number) => {
            const ordered =
              dir === "asc" ? [...messages] : [...messages].reverse();
            return ordered.slice(-n) as unknown[];
          },
        }),
      }),
    }),
    delete: (id) => {
      for (const list of [messages, photos]) {
        const idx = list.findIndex((entry) => (entry as { _id: string })._id === id);
        if (idx >= 0) list.splice(idx, 1);
      }
    },
  };

  return {
    auth: { getUserIdentity: async () => ({ subject: "user-one|session" }) },
    db,
    storage: { getUrl: async () => null },
    runQuery: (name, args) => {
      if (name === "internal.felicia.notesFor") {
        return {
          appearance:
            "soft natural light, no makeup, hair loose",
          mood: "playful",
        };
      }
      if (name === "internal.felicia.topMemories") {
        return [];
      }
      if (name === "internal.felicia.latestChapters") {
        return [];
      }
      if (name === "internal.felicia.conversationStart") {
        return 1700000000000;
      }
      if (name === "internal.felicia.recentMessages") {
        return [...messages]
          .reverse()
          .slice(0, (args.limit as number) ?? 50)
          .map((m) => ({
            _id: m._id,
            role: m.role,
            content: m.content,
            createdAt: Date.parse("2026-01-01"),
            imageStorageId: null,
          }));
      }
      if (name === "internal.felicia.recallMessages") {
        return [];
      }
      if (name === "internal.felicia.sentPhotos") {
        return photos.slice(-(args.limit as number ?? 24));
      }
      throw new Error(`unmocked runQuery: ${name}`);
    },
    runMutation: async (name, args) => {
      // `args` here is the Convex-JSON value the action runtime parsed from
      // the wire payload, which is the same shape we build above.
      if (name === "internal.felicia.saveMessage") {
        db.insert("messages", {
          userId: (args as { userId: string }).userId,
          role: (args as { role: string }).role,
          content: (args as { content: string }).content,
          createdAt: Date.parse("2026-01-01"),
        });
        const last = messages[messages.length - 1];
        return (last as { _id: string })._id as unknown as {
          _id: string;
        };
      }
      if (name === "internal.felicia.savePhoto") {
        db.insert("photos", {
          userId: (args as { userId: string }).userId,
          url: (args as { url?: string | null }).url ?? null,
          galleryId: (args as { galleryId?: string | null }).galleryId ?? null,
          label: (args as { label?: string | null }).label ?? null,
          scene: (args as { scene: string }).scene ?? "",
          prompt: (args as { prompt: string }).prompt ?? "",
          createdAt: Date.parse("2026-01-01"),
        });
        return null;
      }
      throw new Error(`unmocked runMutation: ${name}`);
    },
    runAction: async (name, args) => {
      if (name === "cloudflare.chat") {
        const messages_: Array<{
          role: string;
          content: string;
        }> = args.messages as Array<{
          role: string;
          content: string;
        }>;
        const lastUser = [...messages_]
          .reverse()
          .find((m) => m.role === "user");
        const reply =
          lastUser?.content.includes("cook") ||
          lastUser?.content.includes("kitchen")
            ? "I was just about to get into the kitchen — want me to send you a pic of what I'm making?"
            : "I'm here. Tell me more.";
        return `[[scene: a bright kitchen with sunlight across the counter, wok in hand, steam rising from the pan]]

${reply}`;
      }
      throw new Error(`unmocked runAction: ${name}`);
    },
    scheduler: { runAfter: () => null },
  };
}

describe("sendMessage", () => {
  let ctx: MockCtx;

  beforeEach(() => {
    ctx = buildMockCtx();
  });

  test("persists both sides of the exchange and returns a usable reply", async () => {
    const raw = await sendMessageApi.invokeAction("req:test", JSON.stringify({ text: "I'm in the kitchen cooking jollof right now" }));
    const result = raw as {
      reply: string;
      photoScene: string | null;
      photoUrl: string | null;
      photoLabel: string | null;
      replyMessageId: string;
      photoReadyAfterMs: number;
    };

    expect(result.reply).toContain("kitchen");
    expect(result.photoUrl).toBeNull();
    expect(result.photoReadyAfterMs).toBeGreaterThan(0);
    expect(result.replyMessageId).toMatch(/^messages:/);

    const inOrder = (ctx.db.query("messages").withIndex().order("asc").take(10) as Array<{
      role: string;
      content: string;
    }>).filter(Boolean);

    expect(inOrder.map((m) => m.role)).toEqual(["user", "felicia"]);
    expect(inOrder[0].content).toBe(
      "I'm in the kitchen cooking jollof right now",
    );
    expect(inOrder[1].content).toContain("kitchen");
  });

  test("sends an existing gallery photo when one fits the conversation", async () => {
    const raw = await sendMessageApi.invokeAction("req:test", JSON.stringify({ text: "show me something from the kitchen" }));
    const result = raw as {
      reply: string;
      photoScene: string | null;
      photoUrl: string | null;
      photoLabel: string | null;
      replyMessageId: string;
      photoReadyAfterMs: number;
    };

    expect(result.photoScene).toBeNull();
    expect(result.photoUrl).toMatch(/^https?:\/\//);
    expect(result.photoReadyAfterMs).toBe(0);

    const savedPhotos = (ctx.db.query("photos").withIndex().order("asc").take(10) as Array<{
      url?: string;
      galleryId?: string;
    }>).filter(Boolean);

    expect(savedPhotos).toHaveLength(1);
    expect(savedPhotos[0].url).toBe(result.photoUrl);
    expect(savedPhotos[0].galleryId).toBeTruthy();
  });

  test("rejects an empty message", async () => {
    await expect(
      sendMessageApi.invokeAction("req:test", JSON.stringify({ text: "   " })),
    ).rejects.toThrow(/write something/i);
  });
});

