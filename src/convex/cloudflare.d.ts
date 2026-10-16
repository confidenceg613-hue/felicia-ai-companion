import type { GenericActionCtx, ActionBuilder, RegisteredAction } from "convex/registration";
import type { v } from "convex/values";

declare const _cloudflareChat: RegisteredAction<"public", { messages: { role: string; content: string }[]; model?: string | undefined }, Promise<string>>;
declare const _cloudflareGenerateImage: RegisteredAction<"public", { prompt: string; model?: string | undefined }, Promise<{ storageId: string }>>;
declare const _cloudflareSpeak: RegisteredAction<"public", { text: string; model?: string | undefined }, Promise<{ storageId: string }>>;

export declare const cloudflare: {
  chat: typeof _cloudflareChat;
  generateImage: typeof _cloudflareGenerateImage;
  speak: typeof _cloudflareSpeak;
};
