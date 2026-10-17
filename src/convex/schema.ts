import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // Every message exchanged with Felicia, per user.
    messages: defineTable({
      userId: v.id("users"),
      role: v.union(v.literal("user"), v.literal("felicia")),
      content: v.string(),
      createdAt: v.number(),
      // Cached text-to-speech render of this line. Speaking the same message
      // twice then costs nothing, which matters on a free neuron budget.
      audioStorageId: v.optional(v.id("_storage")),
      // A photo the user attached from the composer. `content` stays empty for
      // these so the conversation renders the image alone, the way a shared
      // picture appears in a real chat.
      imageStorageId: v.optional(v.id("_storage")),
    })
      .index("by_user", ["userId"])
      // Felicia's whole archive is searchable so a message from a year ago can
      // be pulled back into the prompt when the topic comes up again.
      .searchIndex("search_content", {
        searchField: "content",
        filterFields: ["userId"],
      }),

    // Every photo Felicia has sent a user: the ones generated for them, and the
    // ones she picked off her own roll. A generated photo lives in Convex file
    // storage; a roll photo keeps its public URL, because it is part of the app
    // rather than something uploaded to this account.
    photos: defineTable({
      userId: v.id("users"),
      storageId: v.optional(v.id("_storage")),
      url: v.optional(v.string()),
      // Which permanent gallery photo it is, when it came from there.
      galleryId: v.optional(v.string()),
      // Caption shown under the photo, when it has one worth showing.
      label: v.optional(v.string()),
      prompt: v.string(),
      scene: v.string(),
      createdAt: v.number(),
    }).index("by_user", ["userId"]),

    // Felicia's mind map: things she knows, each filed under a category so the
    // graph can colour and cluster them. She builds these from conversation and
    // you can add or edit them yourself.
    memories: defineTable({
      userId: v.id("users"),
      title: v.string(),
      category: v.string(),
      content: v.string(),
      // 1–5. Drives the bubble's size in the graph view.
      strength: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_updated", ["userId", "updatedAt"]),

    // Shared Notes — the editable context that shapes who Felicia is. One row
    // per user holding every section, because they are always read together.
    sharedNotes: defineTable({
      userId: v.id("users"),
      sections: v.record(v.string(), v.string()),
      updatedAt: v.number(),
    }).index("by_user", ["userId"]),

    // Felicia's long-term memory of earlier conversations: one row per stretch
    // of chat she has written up, so something said a year ago is still
    // something she can bring up in detail. Written from the real transcript.
    chapters: defineTable({
      userId: v.id("users"),
      title: v.string(),
      summary: v.string(),
      fromCreatedAt: v.number(),
      toCreatedAt: v.number(),
      messageCount: v.number(),
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_to", ["userId", "toCreatedAt"]),

    // Felicia's persisted appearance choice: outfit, background and optional
    // custom scene. This is what the photo prompt is built from once the user
    // picks a look instead of relying on the Appearance note alone.
    feliciaAppearance: defineTable({
      userId: v.id("users"),
      appearance: v.object({
        outfitKey: v.string(),
        backgroundKey: v.string(),
        overrideScene: v.optional(v.union(v.string(), v.null())),
      }),
    }).index("by_user", ["userId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
