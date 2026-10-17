// This harness is a development helper, not part of the shipped app. It only
// runs under `bun test` and is excluded from the app's `tsc`/`vite` builds.
// Run it with: bun test src/__tests__/sendMessage.test.ts

// @ts-expect-error — `bun:test` is a Bun builtin and is not declared for tsc.
import { expect, test, describe, beforeEach } from "bun:test";

import { sendMessage } from "../convex/felicia.js";

const sendMessageApi = sendMessage as unknown as {
  invokeAction: (requestId: string, argsStr: string) => Promise<unknown>;
};

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

interface MockDb {
  insert: (table: string, row: Record<string, unknown>) => { _id: string };
  patch: (id: string, patch: Record<string, unknown>) => void;
  query: (table: string) => MockQueryApi;
  delete: (id: string) => void;
}

interface MockCtx {
  auth: { getUserIdentity: () => Promise<{ subject: string } | null> };
  db: MockDb;
  storage: { getUrl: (id: string) => Promise<string | null> };
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
  scheduler: { runAfter: (delayMs: number, name: string, args: Record<string, unknown>) => unknown };
}

interface MockViews {
  notesFor(userId: string): Promise<{ appearance: string; mood: string }>;
  topMemories(userId: string): Promise<unknown[]>;
  conversationStart(userId: string): Promise<number>;
  recentMessages(userId: string, limit: number): Promise<unknown[]>;
  recallMessages(userId: string, options: Record<string, unknown>): Promise<unknown[]>;
  sentPhotos(userId: string): Promise<unknown[]>;
}

interface StoredMessage {
  _id: string;
  role: string;
  content: string;
  createdAt: number;
}

interface CollabBag {
  ctx: MockCtx;
  messages: StoredMessage[];
  photos: Array<Record<string, unknown>>;
}

function makePlainCtx(): MockCtx {
  return {
    auth: { getUserIdentity: () => Promise.resolve({ subject: "user-one|session" }) },
    db: {
      insert: (() => {
        const store: Array<{ table: string; row: Record<string, unknown>; _id: string }> = [];
        return function (table: string, row: Record<string, unknown>) {
          const _id = `${table}:${store.length + 1}`;
          store.push({ table, row: { ...row, _id }, _id });
          return { _id };
        };
      })(),
      patch: (() => {
        const store: Array<{ _id: string; row: Record<string, unknown> }> = [];
        return function (id: string, patch: Record<string, unknown>) {
          const entry = store.find((r) => r._id === id);
          if (entry) Object.assign(entry.row, patch);
        };
      })(),
      query: (_: string) => ({ withIndex: () => ({ order: () => ({ take: () => [] }) }) }),
      delete: (() => {
        const store: Array<{ _id: string }> = [];
        return function (id: string) {
          const idx = store.findIndex((r) => r._id === id);
          if (idx >= 0) store.splice(idx, 1);
        };
      })(),
    },
    storage: { getUrl: async () => null },
    scheduler: { runAfter: () => null },
    runQuery: async () => null,
    runMutation: async () => null,
    runAction: async () => null,
  };
}

function makeMockViews(bag: CollabBag): MockViews {
  return {
    async notesFor() {
      return { appearance: "soft natural light, no makeup, hair loose", mood: "playful" };
    },
    async topMemories() {
      return [];
    },
    async conversationStart() {
      return 1700000000000;
    },
    async recentMessages(_, limit) {
      return bag.messages
        .slice()
        .reverse()
        .slice(0, limit)
        .map((m) => ({
          _id: m._id,
          role: m.role,
          content: m.content,
          createdAt: Date.parse("2026-01-01"),
          imageStorageId: null,
        }));
    },
    async recallMessages() {
      return [];
    },
    async sentPhotos() {
      return bag.photos.slice(-24);
    },
  };
}

function withCollabs(): CollabBag {
  const ctx = makePlainCtx();
  const messages: StoredMessage[] = [];
  const photos: Array<Record<string, unknown>> = [];
  const views = makeMockViews({ ctx, messages, photos });

  const insert: MockDb["insert"] = (table, row) => {
    const _id = `${table}:${messages.length + photos.length + 1}`;
    if (table === "messages") {
      messages.push({ ...row, _id } as StoredMessage);
    } else if (table === "photos") {
      photos.push({ ...row, _id });
    }
    return { _id };
  };

  const patch: MockDb["patch"] = (id, patch) => {
    for (const list of [messages, photos]) {
      for (const entry of list) {
        if (entry._id === id) Object.assign(entry, patch);
      }
    }
  };

  const del: MockDb["delete"] = (id) => {
    for (const list of [messages, photos]) {
      const idx = list.findIndex((entry) => entry._id === id);
      if (idx >= 0) list.splice(idx, 1);
    }
  };

  ctx.db = {
    insert,
    patch,
    query: (_table: string) => ({
      withIndex: () => ({
        order: (dir: "asc" | "desc") => ({
          take: (n: number) => {
            const ordered = dir === "asc" ? [...messages] : [...messages].reverse();
            return ordered.slice(-n) as unknown[];
          },
        }),
      }),
    }),
    delete: del,
  } as MockDb;

  function recentMessages(ctx: MockCtx, name: string, args: Record<string, unknown>, userId: string, limit: number) {
    if (name === "internal.felicia.notesFor") {
      return views.notesFor(userId);
    }
    if (name === "internal.felicia.topMemories") {
      return views.topMemories(userId);
    }
    if (name === "internal.felicia.conversationStart") {
      return views.conversationStart(userId);
    }
    if (name === "internal.felicia.recentMessages") {
      return views.recentMessages(userId, args.limit ?? 50);
    }
    if (name === "internal.felicia.recallMessages") {
      return views.recallMessages(userId, args);
    }
    if (name === "internal.felicia.sentPhotos") {
      return views.sentPhotos(userId);
    }
    throw new Error(`unmocked runQuery: ${name}`);
  }

  ctx.runQuery = async (name: string, args: Record<string, unknown>) => {
    if (name === "internal.felicia.notesFor") {
      return views.notesFor("user-one");
    }
    if (name === "internal.felicia.topMemories") {
      return views.topMemories("user-one");
    }
    if (name === "internal.felicia.latestChapters") {
      return views.latestChapters("user-one");
    }
    if (name === "internal.felicia.conversationStart") {
      return views.conversationStart("user-one");
    }
    if (name === "internal.felicia.recentMessages") {
      return recentMessages(ctx, name, args, "user-one", args.limit ?? 50);
    }
    if (name === "internal.felicia.recallMessages") {
      return views.recallMessages("user-one", args);
    }
    if (name === "internal.felicia.sentPhotos") {
      return views.sentPhotos("user-one");
    }
    throw new Error(`unmocked runQuery: ${name}`);
  };

  ctx.runMutation = async (name: string, args: Record<string, unknown>) => {
    if (name === "internal.felicia.saveMessage") {
      const a = args as { userId: string; role: string; content: string };
      const inserted = ctx.db.insert("messages", {
        userId: a.userId,
        role: a.role,
        content: a.content,
        createdAt: Date.parse("2026-01-01"),
      });
      return (inserted as { _id: string })._id as unknown as { _id: string };
    }
    if (name === "internal.felicia.savePhoto") {
      const a = args as {
        userId: string;
        url?: string | null;
        galleryId?: string | null;
        label?: string | null;
        scene: string;
        prompt: string;
      };
      ctx.db.insert("photos", {
        userId: a.userId,
        url: a.url ?? null,
        galleryId: a.galleryId ?? null,
        label: a.label ?? null,
        scene: a.scene ?? "",
        prompt: a.prompt ?? "",
        createdAt: Date.parse("2026-01-01"),
      });
      return null;
    }
    throw new Error(`unmocked runMutation: ${name}`);
  };

  ctx.runAction = async (name: string, args: Record<string, unknown>) => {
    if (name === "cloudflare.chat") {
      const messages_ = ((args as { messages?: Array<{ role: string; content: string }> })
        .messages) ?? [];
      const lastUser = [...messages_]
        .reverse()
        .find((m) => m.role === "user");
      const reply =
        lastUser?.content.includes("cook") || lastUser?.content.includes("kitchen")
          ? "I was just about to get into the kitchen — want me to send you a pic of what I'm making?"
          : "I'm here. Tell me more.";
      return `[[scene: a bright kitchen with sunlight across the counter, wok in hand, steam rising from the pan]]\n\n${reply}`;
    }
    throw new Error(`unmocked runAction: ${name}`);
  };

  return { ctx, messages, photos };
}

async function storedMessages(bag: CollabBag) {
  return bag.ctx.db.query("messages")
    .withIndex()
    .order("asc")
    .take(10)
    .filter((m): m is StoredMessage => Boolean(m));
}

async function storedPhotos(bag: CollabBag) {
  return bag.ctx.db.query("photos")
    .withIndex()
    .order("asc")
    .take(10)
    .filter((m): m is { url?: string | null; galleryId?: string | null } => Boolean(m));
}

describe("sendMessage", () => {
  let bag: CollabBag;

  beforeEach(() => {
    bag = withCollabs();
  });

  test("persists both sides of the exchange and returns a usable reply", async () => {
    const send = sendMessageApi.invokeAction;
    const raw = await send(
      "req:test",
      JSON.stringify({ text: "I'm in the kitchen cooking jollof right now" }),
    );
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

    const inOrder = (await storedMessages(bag)).sort((a, b) => a._id.localeCompare(b._id));
    expect(inOrder.map((m) => m.role)).toEqual(["user", "felicia"]);
    expect(inOrder[0].content).toBe("I'm in the kitchen cooking jollof right now");
    expect(inOrder[1].content).toContain("kitchen");
  });

  test("sends an existing gallery photo when one fits the conversation", async () => {
    const send = sendMessageApi.invokeAction;
    const raw = await send(
      "req:test",
      JSON.stringify({ text: "show me something from the kitchen" }),
    );
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

    const savedPhotos = await storedPhotos(bag);
    expect(savedPhotos).toHaveLength(1);
    expect(savedPhotos[0].url).toBe(result.photoUrl);
    expect(savedPhotos[0].galleryId).toBeTruthy();
  });

  test("rejects an empty message", async () => {
    const send = sendMessageApi.invokeAction;
    await expect(
      send("req:test", JSON.stringify({ text: "   " })),
    ).rejects.toThrow(/write something/i);
  });
});
