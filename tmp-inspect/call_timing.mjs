// Temporary latency breakdown for the call greeting.
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
  ],
});
const context = await browser.newContext({
  viewport: { width: 430, height: 932 },
  permissions: ["microphone", "camera"],
});

await context.addInitScript(() => {
  window.__events = [];
  const realPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function patched(...args) {
    window.__events.push({
      at: performance.now(),
      kind: this.tagName === "AUDIO" ? "audio-play" : "video-play",
      src: String(this.src || "").slice(-24),
    });
    return realPlay.apply(this, args);
  };
});

const page = await context.newPage();
const requests = [];
page.on("request", (request) => {
  if (request.url().includes("convex.cloud")) {
    requests.push({ at: Date.now(), url: request.url().split("/").slice(-1)[0], method: request.method() });
  }
});

await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
const adult = page.getByRole("button", { name: /18 or older/i });
if (await adult.count()) {
  await adult.first().click();
  await page.waitForTimeout(900);
}
await page.getByRole("button", { name: /continue as a guest/i }).click();
await page.waitForURL(/dashboard/, { timeout: 45000 });
await page.waitForTimeout(2500);

const t0 = Date.now();
await page.getByTitle("Video call Felicia").first().click();

const marks = {};
let lastBody = "";
for (let i = 0; i < 200; i += 1) {
  await page.waitForTimeout(100);
  const snap = await page.evaluate(() => ({
    body: document.body.innerText.replace(/\s+/g, " ").slice(0, 600),
    events: window.__events.map((event) => ({ at: event.at, kind: event.kind })),
  }));
  if (!marks.callShell && /live|On a call|listening|connecting/.test(snap.body)) {
    marks.callShell = Date.now() - t0;
  }
  if (!marks.herLine && snap.body.length > lastBody.length && /["“”]/.test(snap.body)) {
    marks.herLine = Date.now() - t0;
  }
  if (!marks.speakingLabel && /speaking/.test(snap.body)) marks.speakingLabel = Date.now() - t0;
  if (!marks.audio && snap.events.some((event) => event.kind === "audio-play")) {
    marks.audio = Date.now() - t0;
  }
  if (marks.audio && marks.speakingLabel) break;
  lastBody = snap.body;
}

console.log("marks:", JSON.stringify(marks));
console.log(
  "convex requests after click:",
  requests
    .filter((request) => request.at >= t0)
    .map((request) => `${request.at - t0}ms ${request.url}`)
    .slice(0, 12),
);
await browser.close();
