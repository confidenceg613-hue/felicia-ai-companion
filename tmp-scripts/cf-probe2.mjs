const token = process.env.CF_TOKEN;
const auth = { Authorization: `Bearer ${token}` };

for (const [label, url] of [
  ["list accounts", "https://api.cloudflare.com/client/v4/accounts"],
  ["user details", "https://api.cloudflare.com/client/v4/user"],
  ["user tokens", "https://api.cloudflare.com/client/v4/user/tokens"],
  ["credit/neuron usage", `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT}/ai/usage`],
]) {
  const r = await fetch(url, { headers: auth });
  console.log(`\n== ${label} ==`, r.status, (await r.text()).slice(0, 300));
}
