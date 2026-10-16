import { action } from "./_generated/server";
import { v } from "convex/values";

export const cloudflare = {
  chat: action({
    args: {
      messages: v.array(
        v.object({ role: v.string(), content: v.string() }),
      ),
      model: v.optional(v.string()),
    },
    returns: v.string(),
    handler: async (_ctx, { messages, model }) => {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) throw new Error("GROQ_API_KEY is not configured.");

      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.7,
            max_tokens: 512,
            stream: false,
          }),
        },
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `Groq request failed: ${response.status} ${response.statusText}${
            text ? ` — ${text.slice(0, 500)}` : ""
          }`,
        );
      }

      const json = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      const reply = json.choices[0]?.message?.content;
      if (!reply) throw new Error("Groq returned an empty reply.");
      return reply;
    },
  }),

  generateImage: action({
    args: {
      prompt: v.string(),
      model: v.optional(v.string()),
    },
    returns: v.object({ storageId: v.id("_storage") }),
    handler: async (_ctx, { prompt }) => {
      if (!process.env.CLOUDFLARE_API_TOKEN) {
        throw new Error(
          "CLOUDFLARE_API_TOKEN is not configured, so photo generation is unavailable.",
        );
      }
      if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
        throw new Error(
          "CLOUDFLARE_ACCOUNT_ID is not configured, so photo generation is unavailable.",
        );
      }
      throw new Error("Not wired yet.");
    },
  }),

  speak: action({
    args: {
      text: v.string(),
      model: v.optional(v.string()),
    },
    returns: v.object({ storageId: v.id("_storage") }),
    handler: async (_ctx, { text }) => {
      if (!process.env.CLOUDFLARE_API_TOKEN) {
        throw new Error(
          "CLOUDFLARE_API_TOKEN is not configured, so voice rendering is unavailable.",
        );
      }
      if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
        throw new Error(
          "CLOUDFLARE_ACCOUNT_ID is not configured, so voice rendering is unavailable.",
        );
      }
      throw new Error("Not wired yet.");
    },
  }),
};
