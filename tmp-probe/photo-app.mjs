import { chromium } from "playwright-core";

/**
 * Sign in as a guest, ask her for a photo through the dress + scene dialog,
 * and confirm the photo that lands in the conversation.
 */
const browser = await chromium.launch({
  executablePath:
    process.env.HOME + "/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
const errors = [];
page.on("pageerror", (err) => errors.push(`PAGEERROR ${err.message}`));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`CONSOLE ${msg.text().slice(0, 200)}`);
});

const step = (message) => console.log(`· ${message}`);

await page.goto("http://localhost:5173/auth", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

const age = page.getByRole("button", { name: /18 or older/i });
if (await age.count()) {
  await age.first().click();
  step("age gate accepted");
  await page.waitForTimeout(500);
}

await page.getByRole("button", { name: /continue as a guest/i }).click();
step("guest sign-in clicked");
await page.waitForURL(/\/dashboard/, { timeout: 45_000 });
await page.waitForTimeout(3000);

await page.getByTitle(/tell her what to wear/i).click();
step("photo dialog opened");
await page.waitForTimeout(600);
await page.getByLabel(/what she's wearing/i).fill("white linen shirt, unbuttoned");
await page.getByLabel(/where she is/i).fill("in the kitchen with a cup of coffee");

const started = Date.now();
await page.getByRole("button", { name: /ask for the photo/i }).click();
step("photo requested — waiting");

const deadline = Date.now() + 240_000;
let found = null;
while (Date.now() < deadline && !found) {
  await page.waitForTimeout(2000);
  const images = await page.evaluate(() =>
    Array.from(document.querySelectorAll("img"))
      .map((img) => ({
        src: img.currentSrc || img.src,
        w: img.naturalWidth,
        h: img.naturalHeight,
        alt: img.alt,
      }))
      .filter(
        (img) =>
          img.w > 200 &&
          img.h > 200 &&
          (img.src.includes("/api/storage/") || img.src.startsWith("blob:")),
      ),
  );
  if (images.length > 0) found = images;
}

const toasts = await page.evaluate(() =>
  Array.from(document.querySelectorAll("[data-sonner-toast]"))
    .map((node) => node.textContent)
    .join(" | "),
);
await page.screenshot({ path: "tmp-probe/photo-result.png" });
console.log("took ms:", Date.now() - started);
console.log("photo:", JSON.stringify(found, null, 2));
console.log("toasts:", toasts || "none");
console.log("errors:", errors.length ? errors.join("\n") : "none");
await browser.close();