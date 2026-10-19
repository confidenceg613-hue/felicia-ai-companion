// Development harness for `sendMessage` — the whole read, decide and store path
// of one message, with Groq and the database mocked out. Excluded from the
// app's tsc/vite builds. Run it with:
//   bun test src/__tests__/sendMessage.test.ts
//
// Note on invocation: Convex's registered `invokeAction` builds its own real
// action context, which cannot exist outside a backend, so these call the
// action's stored handler directly with a mock context instead — the same
// function the deployment runs, minus the runtime around it.

// @ts-expect-error — `bun:test` is a Bun builtin and is not declared for tsc.
import { beforeEach, describe, expect, test } from "bun:test";

import { getFunctionName } from "convex/server";

import { sendMessage } from "../convex/felicia.js";
import { FELICIA_GALLERY } from "../lib/gallery.js";

/**
 * The name behind a Convex function reference, e.g. `felicia:notesFor`.
 *
 * Inside a backend these are opaque proxies; `getFunctionName` is the API the
 * runtime itself uses to read one, which is what lets the mocks below answer
 * the right call.
 */
function refName(reference: unknown): string {
  try {
    return getFunctionName(reference as never);
  } catch {
    return "";
  }
}

/** The action's real handler, called with a mock context. */
const handler = (
  sendMessage as unknown as {
    _handler: (
      ctx: unknown,
      args: { text: string },
    ) => Promise<unknown>;
  }
)._handler;

type Result = {
  reply: string;
  photoScene: string | null;
  photoUrl: string | null;
  photoLabel: string | null;
  replyMessageId: string;
  photoReadyAfterMs: number;
};

const KITCHEN = [
  "braided-chef-red-kitchen",
  "red-romper-kitchen",
  "red-romper-cooking",
  "kitchen-red-top",
  "kitchen-counter-sitting",
];

const RED = [
  "braided-chef-red-kitchen",
  "red-romper-kitchen",
  "red-romper-cooking",
  "kitchen-red-top",
  "red-romper-on-the-bed",
  "red-dress-sofa",
];

/** What the model answers, keyed by what was asked. */
const REPLIES: Array<{ match: RegExp; reply: string }> = [
  {
    match: /kitchen/i,
    reply:
      "I'm in the kitchen right now, come and see.\n" +
      "[[scene: Felicia in her kitchen in the red top, one hand on the granite counter, warm overhead light]]",
  },
  {
    match: /full body/i,
    reply:
      "Standing right here, look at all of me.\n" +
      "[[scene: Felicia standing in her kitchen in the red top, photographed from head to toe]]",
  },
  {
    match: /red/i,
    reply:
      "Something red? Give me a second.\n" +
      "[[scene: Felicia leaning on the counter in the red romper, laughing, daylight across the room]]",
  },
  {
    match: /camel|desert/i,
    reply:
      "I have never been near a camel in my life, but here.\n" +
      "[[scene: Felicia on a camel at a desert fairground at dawn, long shadows across the dunes]]",
  },
  {
    match: /./,
    reply: "Tell me about it. Was it the kind of day that ends with tea?",
  },
];

interface StoredMessage {
  _id: string;
  role: string;
  content: string;
}

interface StoredPhoto {
  _id: string;
  url?: string | null;
  galleryId?: string | null;
  label?: string | null;
  scene?: string | null;
}

interface Bag {
  messages: StoredMessage[];
  photos: StoredPhoto[];
  ctx: {
    auth: { getUserIdentity: () => Promise<{ subject: string } | null> };
    db: {
      insert: (table: string, row: Record<string, unknown>) => { _id: string };
      patch: (id: string, patch: Record<string, unknown>) => void;
      query: (table: string) => unknown;
    };
    storage: { getUrl: (id: string) => Promise<string | null> };
    scheduler: { runAfter: () => null };
    runQuery: (name: string, args: Record<string, unknown>) => Promise<unknown>;
    runMutation: (name: string, args: Record<string, unknown>) => Promise<unknown>;
    runAction: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  };
}

function makeBag(): Bag {
  const messages: StoredMessage[] = [];
  const photos: StoredPhoto[] = [];
  let counter = 0;

  const bag: Bag = {
    messages,
    photos,
    ctx: {
      auth: { getUserIdentity: async () => ({ subject: "user-one|session" }) },
      db: {
        insert(table, row) {
          counter += 1;
          const _id = `${table}:${counter}`;
          if (table === "messages") {
            messages.push(row as unknown as StoredMessage);
            messages[messages.length - 1]._id = _id;
          }
          if (table === "photos") {
            photos.push(row as unknown as StoredPhoto);
            photos[photos.length - 1]._id = _id;
          }
          return { _id };
        },
        patch() {
          // Nothing in this path patches a stored row.
        },
        query() {
          return {
            withIndex: () => ({
              order: () => ({
                take: (n: number) => messages.slice(-n),
              }),
            }),
          };
        },
      },
      storage: { getUrl: async () => null },
      scheduler: { runAfter: () => null },
      async runQuery(name, args) {
        const called = refName(name);
        if (called.endsWith("notesFor")) {
          return { appearance: "soft natural light, no makeup, hair loose" };
        }
        if (
          called.endsWith("topMemories") ||
          called.endsWith("latestChapters")
        ) {
          return [];
        }
        if (called.endsWith("conversationStart")) return 1700000000000;
        if (called.endsWith("recallMessages")) return [];
        if (called.endsWith("sentPhotos")) return [];
        if (called.endsWith("recentMessages")) {
          // Her history: the message was stored before the model is asked, so
          // the latest line is always the one being replied to.
          const limit = Number((args as { limit?: number }).limit ?? 24);
          return messages.slice(-limit).map((message) => ({
            ...message,
            createdAt: 1700000000000,
            imageStorageId: null,
          }));
        }
        throw new Error(`unmocked runQuery: ${called}`);
      },
      async runMutation(name, args) {
        const called = refName(name);
        if (called.endsWith("saveMessage")) {
          const a = args as { userId: string; role: string; content: string };
          const inserted = bag.ctx.db.insert("messages", {
            userId: a.userId,
            role: a.role,
            content: a.content,
            createdAt: 1700000000000,
          });
          return inserted._id;
        }
        if (called.endsWith("savePhoto")) {
          bag.ctx.db.insert("photos", args as Record<string, unknown>);
          return null;
        }
        throw new Error(`unmocked runMutation: ${called}`);
      },
      async runAction(name, args) {
        const called = refName(name);
        if (!called.endsWith("groq:chat")) {
          throw new Error(`unmocked runAction: ${called}`);
        }
        const messages_ =
          (args as { messages?: Array<{ role: string; content: string }> })
            .messages ?? [];
        const asked =
          [...messages_].reverse().find((m) => m.role === "user")?.content ?? "";
        const canned =
          REPLIES.find((candidate) => candidate.match.test(asked)) ??
          REPLIES[REPLIES.length - 1];
        return canned.reply;
      },
    },
  };

  return bag;
}

describe("sendMessage", () => {
  let bag: Bag;
  beforeEach(() => {
    bag = makeBag();
  });

  function invoke(text: string) {
    return handler(bag.ctx, { text });
  }

  test("stores the exchange and sends a photo from her gallery when one fits", async () => {
    const result = (await invoke("send me a pic of you in the kitchen")) as Result;

    // Both sides of the conversation are kept.
    expect(bag.messages.map((message) => message.role)).toEqual([
      "user",
      "felicia",
    ]);
    expect(bag.messages[0].content).toBe("send me a pic of you in the kitchen");

    // She had one already, so it goes straight away: no scene to generate, no
    // waiting.
    expect(result.photoScene).toBeNull();
    expect(result.photoReadyAfterMs).toBe(0);
    expect(KITCHEN).toContain(bag.photos[0]?.galleryId ?? "");
    expect(result.photoUrl).toBe(
      FELICIA_GALLERY.find((photo) => photo.id === bag.photos[0].galleryId)
        ?.url ?? null,
    );
    expect(result.photoLabel).toBe(
      FELICIA_GALLERY.find((photo) => photo.id === bag.photos[0].galleryId)
        ?.title ?? null,
    );

    // And it is filed in her album for this account.
    expect(bag.photos).toHaveLength(1);
  });

  test("asking for red sends a picture of her in red", async () => {
    const result = (await invoke("send me a pic of you wearing red")) as Result;
    expect(RED).toContain(bag.photos[0]?.galleryId ?? "");
    expect(result.photoUrl).not.toBeNull();
  });

  test("takes a new photo when nothing in her gallery fits", async () => {
    const result = (await invoke(
      "send me a pic of you riding a camel in the desert",
    )) as Result;

    expect(result.photoUrl).toBeNull();
    expect(result.photoScene).toContain("camel");
    expect(result.photoReadyAfterMs).toBeGreaterThan(0);
    expect(bag.photos).toHaveLength(0);
  });

  test("a full-body request takes a new photo instead of sending a portrait", async () => {
    const result = (await invoke(
      "show me a photo of your full body babe",
    )) as Result;

    // Her roll is portraits, so picking from it here would answer a whole-body
    // request with a headshot. She takes a new photo in the tall frame instead.
    expect(result.photoUrl).toBeNull();
    expect(result.photoScene).not.toBeNull();
    expect(result.photoReadyAfterMs).toBeGreaterThan(0);
    expect(bag.photos).toHaveLength(0);
  });

  test("sends no photo at all when none was asked for", async () => {
    const result = (await invoke("I had a rough day at work today")) as Result;

    expect(result.photoUrl).toBeNull();
    expect(result.photoScene).toBeNull();
    expect(result.photoReadyAfterMs).toBe(0);
    expect(bag.photos).toHaveLength(0);
  });

  test("rejects an empty message", async () => {
    await expect(invoke("   ")).rejects.toThrow(/write something/i);
  });
});
