import { z } from 'zod';

/**
 * Runtime shapes for the Cloudflare responses whose fields are stored or acted on: resource IDs
 * that later deploys bind and teardowns delete, the Pages project and its subdomain, deployments,
 * and accounts. The responses were cast with `as T`, so a changed or unexpected shape would have
 * written `undefined` IDs into project state. Extra fields are allowed; missing ones are errors.
 */
export const cloudflareSchemas = {
  accounts: z.array(z.object({ id: z.string().min(1), name: z.string() }).passthrough()),
  pagesProject: z.object({ name: z.string().min(1), subdomain: z.string().optional() }).passthrough(),
  deployment: z.object({ id: z.string().min(1), url: z.string().optional() }).passthrough(),
  d1Database: z.object({ uuid: z.string().min(1), name: z.string().min(1) }).passthrough(),
  kvNamespace: z.object({ id: z.string().min(1), title: z.string().min(1) }).passthrough(),
  queue: z.object({ queue_id: z.string().min(1), queue_name: z.string().min(1) }).passthrough(),
  r2Bucket: z.object({ name: z.string().min(1), jurisdiction: z.string().optional() }).passthrough(),
  r2BucketList: z.object({ buckets: z.array(z.object({ name: z.string().min(1), jurisdiction: z.string().optional() }).passthrough()) }).passthrough(),
  durableObjectNamespace: z.object({ id: z.string().min(1), class: z.string(), name: z.string(), script: z.string() }).passthrough(),
};
