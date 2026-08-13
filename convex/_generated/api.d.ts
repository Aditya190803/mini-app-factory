/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiSettings from "../aiSettings.js";
import type * as auth from "../auth.js";
import type * as collaboration from "../collaboration.js";
import type * as components_ from "../components.js";
import type * as conversations from "../conversations.js";
import type * as deployments from "../deployments.js";
import type * as files from "../files.js";
import type * as integrations from "../integrations.js";
import type * as projects from "../projects.js";
import type * as uploads from "../uploads.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiSettings: typeof aiSettings;
  auth: typeof auth;
  collaboration: typeof collaboration;
  components: typeof components_;
  conversations: typeof conversations;
  deployments: typeof deployments;
  files: typeof files;
  integrations: typeof integrations;
  projects: typeof projects;
  uploads: typeof uploads;
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
