import { z } from "zod";
import type { Doc } from "@/convex/_generated/dataModel";

/**
 * The one definition of a project as the Next.js side sees it.
 *
 * The shape used to be written out three times — a TypeScript interface in lib/projects.ts, this
 * zod schema, and the Convex schema — and they had drifted (this schema had no `globalSeo`, so it
 * was always undefined on the server). Now the zod schema is the definition, `ProjectMetadata`
 * is inferred from it, and the assertion below fails to compile if a field here stops matching
 * the Convex schema, which stays the source of truth for storage.
 */
const seoEntry = z.object({
  path: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  ogImage: z.string().optional(),
});

const projectRecordSchema = z.object({
  projectName: z.string(),
  prompt: z.string(),
  createdAt: z.coerce.number(),
  updatedAt: z.coerce.number().optional(),
  status: z.enum(['pending', 'generating', 'completed', 'error']),
  accessRole: z.enum(['owner', 'editor', 'viewer']).optional(),
  target: z.enum(['static', 'edge']).optional(),
  filesVersion: z.number().optional(),
  html: z.string().optional(),
  isPublished: z.boolean().optional(),
  userId: z.string().optional(),
  isMultiPage: z.boolean().optional(),
  pageCount: z.number().optional(),
  description: z.string().optional(),
  referenceUrl: z.string().optional(),
  projectInstructions: z.string().optional(),
  selectedModel: z.string().optional(),
  providerId: z.string().optional(),
  favicon: z.string().optional(),
  globalSeo: z.object({ siteName: z.string().optional(), description: z.string().optional(), ogImage: z.string().optional() }).optional(),
  seoData: z.array(seoEntry).optional(),
  deploymentUrl: z.string().optional(),
  repoUrl: z.string().optional(),
  deployProvider: z.string().optional(),
  deployedAt: z.coerce.number().optional(),
  netlifySiteName: z.string().optional(),
  cloudflareProjectName: z.string().optional(),
  cloudflareDeploymentId: z.string().optional(),
  cloudflareD1DatabaseId: z.string().optional(),
  cloudflareD1DatabaseName: z.string().optional(),
  cloudflareCustomDomain: z.string().optional(),
  cloudflareResourcesJson: z.string().optional(),
  cloudflarePreviewProjectName: z.string().optional(),
  cloudflarePreviewDeploymentId: z.string().optional(),
  cloudflarePreviewUrl: z.string().optional(),
  cloudflarePreviewResourcesJson: z.string().optional(),
  cloudflarePreviewExpiresAt: z.coerce.number().optional(),
});

type ProjectRecord = z.infer<typeof projectRecordSchema>;

// Compile-time drift check: every field here must exist on the Convex document with a compatible
// type (accessRole is added by the getProject query, not stored).
type StoredFields = Omit<ProjectRecord, 'accessRole'>;
type AssertAssignable<T extends Partial<Record<keyof StoredFields, unknown>>> = T;
export type _ProjectSchemaInSync = AssertAssignable<{ [K in keyof StoredFields]: Doc<'projects'>[K] }>;
const _storedMatchesConvex: (doc: Doc<'projects'>) => Partial<StoredFields> = (doc) => doc;
void _storedMatchesConvex;

export type ProjectMetadata = Omit<ProjectRecord, 'projectName'> & { name: string };

export const projectFileRecordSchema = z.object({
  path: z.string(),
  content: z.string(),
  language: z.enum(['html', 'css', 'javascript', 'sql', 'json']),
  fileType: z.enum(['page', 'partial', 'style', 'script', 'worker', 'migration', 'config']),
  createdAt: z.coerce.number().optional(),
  updatedAt: z.coerce.number().optional(),
}).passthrough();

/** Validate a Convex project record and rename `projectName` to `name`. Unknown fields are dropped. */
export function normalizeProjectMetadata(record: unknown): ProjectMetadata {
  const { projectName, ...rest } = projectRecordSchema.parse(record);
  return { name: projectName, ...rest };
}
