import { describe, expect, test } from "bun:test";
import { isIntimate, isRefusal } from "../convex/mature";

describe("isRefusal", () => {
  test("catches the lines the model produces instead of her reply", () => {
    expect(isRefusal("I'm not comfortable discussing that.")).toBe(true);
    expect(isRefusal("I'm not comfortable continuing this.")).toBe(true);
    expect(isRefusal("I'm sorry, but I can't continue with that.")).toBe(true);
    expect(isRefusal("I can't help with that request.")).toBe(true);
    expect(isRefusal("I'm unable to continue this conversation.")).toBe(true);
    expect(isRefusal("As an AI, I don't have those feelings.")).toBe(true);
  });

  test("leaves her own lines alone", () => {
    expect(isRefusal("Hey! What's up?")).toBe(false);
    expect(isRefusal("Nah today's Sunday")).toBe(false);
    expect(isRefusal("Later, babe — I'm not typing that out over text.")).toBe(false);
    expect(isRefusal("I can't believe you said that 😭")).toBe(false);
    expect(isRefusal("")).toBe(false);
  });

  test("ignores long replies that merely mention a refusal", () => {
    expect(
      isRefusal(
        "You know what, I was going to tell you about the shoot and how the whole day " +
          "went sideways, but then my generator decided to die on me again and I spent " +
          "an hour on the phone with a man who kept saying he couldn't help with that, " +
          "so no, I have no heroic story for you tonight, just suya and my bad mood.",
      ),
    ).toBe(false);
  });
});

describe("isIntimate", () => {
  test("detects explicit turns", () => {
    expect(isIntimate("what's your favourite sex position")).toBe(true);
    expect(isIntimate("I want to fuck you")).toBe(true);
    expect(isIntimate("tell me how you touch yourself")).toBe(true);
    expect(isIntimate("I'll cum in your mouth")).toBe(true);
  });

  test("leaves ordinary conversation alone", () => {
    expect(isIntimate("Hi")).toBe(false);
    expect(isIntimate("what are you doing tonight")).toBe(false);
    expect(isIntimate("send me a photo of the beach")).toBe(false);
  });

  test("stays on when recent history is explicit", () => {
    const history = [
      { role: "user", content: "hi" },
      { role: "felicia", content: "I want you inside me" },
    ];
    expect(isIntimate("go on", history)).toBe(true);
  });
});
