import { query } from "./_generated/server";

/**
 * Which optional sign-in providers this deployment can actually use.
 *
 * A provider added to `convexAuth` still needs its credentials in the
 * deployment's environment. Without them the button would render and then fail
 * at the provider, so the sign-in card asks here first and only shows a button
 * that will work. Values are read on the backend — the secret never reaches
 * the browser, only the boolean.
 */
export const enabled = query({
  args: {},
  handler: async () => ({
    google: Boolean(
      process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
    ),
  }),
});
