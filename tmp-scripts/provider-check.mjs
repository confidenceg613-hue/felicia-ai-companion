import { execSync } from "node:child_process";

function env(name) {
  try {
    return execSync(`bunx convex env get ${name}`, { encoding: "utf8", timeout: 60_000 }).trim();
  } catch {
    return "";
  }
}

const bfl = env("BFL_API_KEY");
const venice = env("VENICE_API_KEY2") || env("VENICE_API_KEY");
console.log("bfl present:", Boolean(bfl), "venice present:", Boolean(venice));

if (bfl) {
  const r = await fetch("https://api.bfl.ai/v1/get_result?id=probe", {
    headers: { "x-key": bfl },
  });
  console.log("== BFL probe ==", r.status, (await r.text()).slice(0, 300));
}

if (venice) {
  const r = await fetch("https://api.venice.ai/api/v1/models?type=image", {
    headers: { Authorization: `Bearer ${venice}` },
  });
  console.log("== Venice models ==", r.status, (await r.text()).slice(0, 400));
}

// Is the token recognised at all, and which permissions does it carry?
const token = process.env.CF_TOKEN;
const account = process.env.CF_ACCOUNT;
if (token && account) {
  const auth = { Authorization: `Bearer ${token}` };
  const checks = [
    ["account token verify", `https://api.cloudflare.com/client/v4/accounts/${account}/tokens/verify`],
    ["account read", `https://api.cloudflare.com/client/v4/accounts/${account}`],
    ["workers-ai models", `https://api.cloudflare.com/client/v4/accounts/${account}/ai/models/search?per_page=5`],
  ];
  for (const [label, url] of checks) {
    const r = await fetch(url, { headers: auth });
    console.log(`\n== CF ${label} ==`, r.status, (await r.text()).slice(0, 700));
  }
}
