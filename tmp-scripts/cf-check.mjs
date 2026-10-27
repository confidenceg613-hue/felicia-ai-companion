import { execSync } from "node:child_process";

function env(name) {
  if (process.env.CF_TOKEN && name === "CLOUDFLARE_API_TOKEN") return process.env.CF_TOKEN;
  if (process.env.CF_ACCOUNT && name === "CLOUDFLARE_ACCOUNT_ID") return process.env.CF_ACCOUNT;
  try {
    return execSync(`bunx convex env get ${name}`, {
      encoding: "utf8",
      timeout: 60_000,
    }).trim();
  } catch (error) {
    console.log("env read failed:", String(error).slice(0, 200));
    return "";
  }
}

const token = env("CLOUDFLARE_API_TOKEN");
const account = env("CLOUDFLARE_ACCOUNT_ID");
console.log("token present:", Boolean(token), "len", token.length);
console.log("account:", account);

async function verify() {
  const r = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const t = await r.text();
  console.log("\n== verify ==", r.status, t.slice(0, 500));
}

async function searchModels() {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/ai/models/search?search=flux&per_page=50`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const t = await r.text();
  console.log("\n== model search (flux) ==", r.status, t.slice(0, 2000));
}

async function gen(model, withRef) {
  const form = new FormData();
  form.set("prompt", "A photograph of a woman standing in a sunlit kitchen.");
  form.set("width", "832");
  form.set("height", "1216");
  form.set("steps", "6");
  if (withRef) {
    const img = await fetch(
      "https://i.postimg.cc/nZ55RgqW/1113447a-e7a9-41f7-b426-cc81e34f04e1.png?dl=1",
    );
    console.log("ref fetch:", img.status, img.headers.get("content-type"));
    const bytes = await img.arrayBuffer();
    console.log("ref bytes:", bytes.byteLength);
    form.set(
      "input_image_0",
      new Blob([bytes], { type: img.headers.get("content-type") ?? "image/png" }),
      "her.png",
    );
  }
  const started = Date.now();
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form },
  );
  const t = await r.text();
  console.log(
    `\n== run ${model} ref=${withRef} ==`,
    r.status,
    `${Date.now() - started}ms`,
    r.ok ? `(body ${t.length} chars, image: ${Boolean(JSON.parse(t).result?.image)})` : t.slice(0, 800),
  );
}

await verify();
await searchModels();
await gen("@cf/black-forest-labs/flux-2-dev", false);
await gen("@cf/black-forest-labs/flux-2-dev", true);
