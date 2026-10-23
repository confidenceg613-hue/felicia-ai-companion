import { chromium } from "playwright";
const EXE = "/home/daytona/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome";
const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox","--disable-dev-shm-usage","--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream"] });
const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
await page.goto("http://localhost:5173/auth", { waitUntil: "networkidle" });
await page.waitForTimeout(3000);
const buttons = await page.locator("button").evaluateAll((nodes) =>
  nodes.map((n) => ({ text: (n.textContent || "").trim().slice(0, 40), disabled: n.disabled, box: n.getBoundingClientRect().toJSON() })),
);
console.log(JSON.stringify(buttons, null, 1).slice(0, 2000));
await browser.close();
