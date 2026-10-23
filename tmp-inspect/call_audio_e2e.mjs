// Temporary instrumented end-to-end check of the video call page.
// Not part of the app. Run with:
//   LD_LIBRARY_PATH=/tmp/cairo/usr/lib/x86_64-linux-gnu:/tmp/shm/usr/lib/x86_64-linux-gnu:/tmp/xcb/usr/lib/x86_64-linux-gnu bun tmp-inspect/call_audio_e2e.mjs
import { chromium } from "playwright";

const EXE =
  "/home/daytona/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome";
const BASE = "http://localhost:5173";

const browser = await chromium.launch({
  executablePath: EXE,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--autoplay-policy=user-gesture-required",
    "--window-size=430,932",
  ],
});

const context = await browser.newContext({
  viewport: { width: 430, height: 932 },
  permissions: ["microphone", "camera"],
});

// Instrument the audio pipeline before any app code runs.
await context.addInitScript(() => {
  const target = (window.__audio = {
    plays: [],
    spoken: [],
    synthBlocked: 0,
    contextState: "none",
  });

  const realPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function patchedPlay(...args) {
    const entry = {
      src: String(this.currentSrc || this.src || "").slice(0, 120),
      tag: this.tagName,
      startedAt: Math.round(performance.now()),
      played: false,
      error: "",
      ended: false,
    };
    target.plays.push(entry);
    const promise = realPlay.apply(this, args);
    if (promise && typeof promise.then === "function") {
      promise
        .then(() => {
          entry.played = true;
        })
        .catch((error) => {
          entry.error = String(error && error.name ? error.name : error);
        });
    } else {
      entry.played = true;
    }
    this.addEventListener("ended", () => {
      entry.ended = true;
    });
    return promise;
  };

  if (window.speechSynthesis) {
    const realSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = (utterance) => {
      target.spoken.push(String(utterance.text || "").slice(0, 100));
      return realSpeak(utterance);
    };
  }

  const RealContext = window.AudioContext;
  if (RealContext) {
    window.AudioContext = class extends RealContext {
      constructor(...args) {
        super(...args);
        target.contextState = this.state;
      }
    };
  }
});

const page = await context.newPage();
const logs = [];
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") {
    logs.push(`[${message.type()}] ${message.text().slice(0, 400)}`);
  }
});
page.on("pageerror", (error) => logs.push(`[pageerror] ${error.message}`));

const step = async (label, fn) => {
  const started = Date.now();
  try {
    const value = await fn();
    console.log(`✓ ${label} (${Date.now() - started} ms)${value ? ` → ${value}` : ""}`);
    return value;
  } catch (error) {
    console.log(`✗ ${label}: ${error.message.split("\n")[0]}`);
    return null;
  }
};

await step("open /auth", async () => {
  await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
});

await step("pass the age gate", async () => {
  const adult = page.getByRole("button", { name: /18 or older/i });
  if (await adult.count()) {
    await adult.first().click();
    await page.waitForTimeout(1000);
  }
});

const signedIn = await step("continue as guest", async () => {
  await page.getByRole("button", { name: /continue as a guest/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 45000 });
  await page.waitForTimeout(2500);
  return "dashboard";
});

if (signedIn) {
  // A real user gesture is the closest thing to a tap this harness can give.
  const openedAt = Date.now();
  await step("click the video call", async () => {
    await page.getByTitle("Video call Felicia").first().click();
    await page.waitForTimeout(400);
  });

  // Watch the call for the greeting: her status text and her audio element.
  const observed = await step("watch the call for 22 s", async () => {
    const seen = { statuses: [], firstAudioAt: null, firstSpokenAt: null };
    for (let i = 0; i < 44; i += 1) {
      await page.waitForTimeout(500);
      const text = await page.locator("body").innerText();
      const status =
        /connecting…|listening|thinking…|speaking|muted/.exec(text)?.[0] ?? "?";
      if (seen.statuses.at(-1) !== status) seen.statuses.push(status);
      const audio = await page.evaluate(() => window.__audio);
      const live = audio.plays.find((entry) => entry.played);
      if (live && seen.firstAudioAt === null) seen.firstAudioAt = Date.now() - openedAt;
      if (audio.spoken.length > 0 && seen.firstSpokenAt === null) {
        seen.firstSpokenAt = Date.now() - openedAt;
      }
    }
    return JSON.stringify(seen);
  });

  const audioReport = await page.evaluate(() => {
    const audio = window.__audio;
    return {
      plays: audio.plays.slice(0, 6),
      spoken: audio.spoken.slice(0, 3),
      contextState: audio.contextState,
    };
  });
  console.log("audio:", JSON.stringify(audioReport, null, 2));

  await step("picture on screen", async () => {
    const image = await page.evaluate(() => {
      const images = [...document.querySelectorAll("img")].filter(
        (img) => img.clientWidth > 120,
      );
      return images.map((img) => ({
        src: img.currentSrc.slice(0, 80),
        loaded: img.complete && img.naturalWidth > 0,
        size: `${img.clientWidth}x${img.clientHeight}`,
      }));
    });
    if (image.length === 0) throw new Error("no large picture on the call");
    if (!image.some((entry) => entry.loaded)) throw new Error("her picture never loaded");
    return JSON.stringify(image.slice(0, 3));
  });

  await step("your camera tile", async () => {
    const video = await page.evaluate(() => {
      const element = document.querySelector("video");
      if (!element) return null;
      return {
        readyState: element.readyState,
        width: element.videoWidth,
        height: element.videoHeight,
        paused: element.paused,
        box: `${element.clientWidth}x${element.clientHeight}`,
      };
    });
    if (!video) throw new Error("no <video> element");
    if (video.width === 0) throw new Error(`camera frames missing: ${JSON.stringify(video)}`);
    return JSON.stringify(video);
  });

  await step("her mouth moves while she talks", async () => {
    const overlay = await page.evaluate(async () => {
      const canvas = [...document.querySelectorAll("canvas")].find(
        (node) => node.clientWidth > 40,
      );
      if (!canvas) return { found: false };
      const samples = [];
      for (let i = 0; i < 12; i += 1) {
        samples.push(canvas.width > 0 ? canvas.toDataURL().length : 0);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return { found: true, unique: new Set(samples).size, samples: samples.slice(0, 5) };
    });
    return JSON.stringify(overlay);
  });

  await step("muted note / typed fallback", async () => {
    const muted = page.getByTitle(/mute|unmute/i).first();
    if (await muted.count()) {
      await muted.click();
      await page.waitForTimeout(1200);
    }
    const input = page.locator("input[placeholder*='Type to her']").first();
    if (!(await input.count())) throw new Error("no typed fallback input");
    return "present";
  });

  const startedTyping = Date.now();
  await step("type to her and measure her first sound", async () => {
    await page.evaluate(() => {
      window.__audio.plays.length = 0;
    });
    const input = page.locator("input[placeholder*='Type to her']").first();
    await input.fill("Tell me something about your day, quickly");
    await input.press("Enter");

    let repliedAt = null;
    let audioAt = null;
    let spokenAt = null;
    for (let i = 0; i < 60; i += 1) {
      await page.waitForTimeout(500);
      const text = await page.locator("body").innerText();
      const audio = await page.evaluate(() => window.__audio);
      if (repliedAt === null && /speaking|listening|thinking/.test(text)) {
        if (/speaking/.test(text)) repliedAt = Date.now() - startedTyping;
      }
      if (audioAt === null && audio.plays.some((entry) => entry.played)) {
        audioAt = Date.now() - startedTyping;
      }
      if (spokenAt === null && audio.spoken.length > 0) {
        spokenAt = Date.now() - startedTyping;
      }
      if (audioAt !== null && spokenAt !== null) break;
    }
    return `speaking@${repliedAt}ms audio@${audioAt}ms deviceVoice@${spokenAt}ms`;
  });

  await step("cannot send while she talks (busy guard)", async () => {
    const input = page.locator("input[placeholder*='Type to her']").first();
    const disabled = await input.isDisabled();
    return `typed input disabled while busy: ${disabled}`;
  });

  await page.screenshot({ path: "tmp-inspect/call-audio-01.png" });

  await step("hang up returns to the chat", async () => {
    const hangUp = page.getByTitle(/hang up|end call/i).first();
    if (!(await hangUp.count())) throw new Error("no hang-up control");
    await hangUp.click();
    await page.waitForTimeout(1500);
    const text = await page.locator("body").innerText();
    if (/On a call/.test(text)) throw new Error("call screen still open");
    return "closed";
  });
}

console.log("\n--- console problems ---");
console.log(logs.slice(0, 20).join("\n") || "(none)");

await browser.close();
