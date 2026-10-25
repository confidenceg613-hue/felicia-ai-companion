/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _probe from "../_probe.js";
import type * as accounts from "../accounts.js";
import type * as auth from "../auth.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as authProviders from "../authProviders.js";
import type * as config from "../config.js";
import type * as crons from "../crons.js";
import type * as felicia from "../felicia.js";
import type * as feliciaAppearance from "../feliciaAppearance.js";
import type * as groq from "../groq.js";
import type * as http from "../http.js";
import type * as images from "../images.js";
import type * as mature from "../mature.js";
import type * as photos_import from "../photos_import.js";
import type * as tts_test from "../tts_test.js";
import type * as users from "../users.js";
import type * as videos from "../videos.js";
import type * as vision from "../vision.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  _probe: typeof _probe;
  accounts: typeof accounts;
  auth: typeof auth;
  "auth/emailOtp": typeof auth_emailOtp;
  authProviders: typeof authProviders;
  config: typeof config;
  crons: typeof crons;
  felicia: typeof felicia;
  feliciaAppearance: typeof feliciaAppearance;
  groq: typeof groq;
  http: typeof http;
  images: typeof images;
  mature: typeof mature;
  photos_import: typeof photos_import;
  tts_test: typeof tts_test;
  users: typeof users;
  videos: typeof videos;
  vision: typeof vision;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
