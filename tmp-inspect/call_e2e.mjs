// Temporary end-to-end check of the video call page. Not part of the app.
// Run with: LD_LIBRARY_PATH=... bun tmp-inspect/call_e2e.mjs
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
    "--autoplay-policy=no-user-gesture-required",
  ],
});

const context = await browser.newContext({
  viewport: { width: 430, height: 932 },
  permissions: ["microphone", "camera"],
});
const page = await context.newPage();

const logs = [];
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") {
    logs.push(`[${message.type()}] ${message.text()}`);
  }
});
page.on("pageerror", (error) => logs.push(`[pageerror] ${error.message}`));

const step = async (label, fn) => {
  const started = Date.now();
  try {
    await fn();
    console.log(`✓ ${label} (${Date.now() - started} ms)`);
  } catch (error) {
    console.log(`✗ ${label}: ${error.message.split("\n")[0]}`);
  }
};

await step("open /auth", async () => {
  await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
  await page.screenshot({ path: "tmp-inspect/call-01-auth.png" });
});

await step("pass the age gate", async () => {
  const adult = page.getByRole("button", { name: /18 or older/i });
  if (await adult.count()) {
    await adult.first().click();
    await page.waitForTimeout(1200);
  }
});

await step("continue as guest", async () => {
  await page.getByRole("button", { name: /continue as a guest/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 45000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "tmp-inspect/call-02-chat.png" });
});

await step("send a typed message in the chat", async () => {
  const box = page.locator("textarea").first();
  await box.fill("Hey, I'm testing the call — say something sweet");
  await box.press("Enter");
  await page.waitForTimeout(9000);
  await page.screenshot({ path: "tmp-inspect/call-03-reply.png" });
});

await step("open the video call", async () => {
  await page.getByTitle("Video call Felicia").first().click();
  await page.waitForTimeout(7000);
  await page.screenshot({ path: "tmp-inspect/call-04-video.png" });
});

await step("dismiss the mouth-alignment dialog", async () => {
  const use = page.getByRole("button", { name: /use this picture/i });
  if (await use.count()) {
    await use.first().click();
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: "tmp-inspect/call-05-after-align.png" });
});

await step("type to her during the call", async () => {
  const input = page.locator("input[placeholder*='Type to her']").first();
  await input.fill("Can you hear me? Tell me what you're wearing");
  await input.press("Enter");
  await page.waitForTimeout(12000);
  await page.screenshot({ path: "tmp-inspect/call-06-call-reply.png" });
});

const body = await page.locator("body").innerText();
console.log("\n--- call screen text ---\n", body.slice(0, 700));
console.log("\n--- console problems ---");
console.log(logs.slice(0, 25).join("\n") || "(none)");

await browser.close();
