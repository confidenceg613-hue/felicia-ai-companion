// Temporary focused check: her mouth, the call controls, layout fit.
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
  window.__audio = [];
  const realPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function patched(...args) {
    const entry = { src: String(this.src || "").slice(0, 90), ago: Math.round(performance.now()) };
    window.__audio.push(entry);
    return realPlay.apply(this, args);
  };
});

const page = await context.newPage();
const logs = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`);
});
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
const adult = page.getByRole("button", { name: /18 or older/i });
if (await adult.count()) {
  await adult.first().click();
  await page.waitForTimeout(900);
}
await page.getByRole("button", { name: /continue as a guest/i }).click();
await page.waitForURL(/dashboard/, { timeout: 45000 });
await page.waitForTimeout(2000);

const clicked = Date.now();
await page.getByTitle("Video call Felicia").first().click();

// Sample the mouth while she says her opening line.
const samples = [];
let speakingSeen = 0;
let lastLineText = "";
for (let i = 0; i < 120; i += 1) {
  await page.waitForTimeout(200);
  const snap = await page.evaluate(() => {
    const mouth = document.querySelector('[data-part="mouth"]');
    const text = document.body.innerText;
    return {
      opacity: mouth ? Number(mouth.style.opacity || 0) : null,
      transform: mouth ? mouth.style.transform : null,
      speaking: /speaking/.test(text),
      listening: /listening/.test(text),
      errored: /went wrong|failed|error/i.test(text),
    };
  });
  if (snap.speaking) speakingSeen += 1;
  if (snap.opacity !== null) samples.push(Number(snap.opacity.toFixed(3)));
  if (i === 60) lastLineText = await page.locator("body").innerText();
  if (speakingSeen > 0 && snap.listening && samples.length > 30) break;
}

const audio = await page.evaluate(() => window.__audio);
const controls = await page.evaluate(() => {
  const buttons = [...document.querySelectorAll("button")].map((b) => ({
    title: b.getAttribute("title"),
    label: b.getAttribute("aria-label"),
    text: (b.innerText || "").trim().slice(0, 24),
  }));
  return {
    buttons,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    scroll: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight },
  };
});

console.log("her first audio after", audio.find((a) => a.src.includes("storage"))?.ago,
  "ms; call clicked at", clicked);
console.log("speaking frames:", speakingSeen, "mouth samples:", samples.slice(0, 24).join(","));
console.log("mouth moved:", new Set(samples.map((n) => n.toFixed(2))).size > 1,
  "max opacity:", Math.max(...samples));
console.log("controls:", JSON.stringify(controls.buttons));
console.log("layout:", JSON.stringify(controls.viewport), JSON.stringify(controls.scroll),
  "horizontal overflow:", controls.scroll.w > controls.viewport.w);
console.log("body text:", (lastLineText || "").replace(/\s+/g, " ").slice(0, 300));
console.log("console problems:", logs.slice(0, 8).join(" | ") || "(none)");

await page.screenshot({ path: "tmp-inspect/call-focused.png" });
await browser.close();
