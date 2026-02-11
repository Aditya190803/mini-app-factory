import { z } from "zod";

export const projectRecordSchema = z.object({
  projectName: z.string(),
  prompt: z.string(),
  createdAt: z.coerce.number(),
  updatedAt: z.coerce.number().optional(),
  status: z.union([
    z.literal('pending'),
    z.literal('generating'),
    z.literal('completed'),
    z.literal('error'),
  ]),
  html: z.string().optional(),
  isPublished: z.boolean().optional(),
  userId: z.string().optional(),
  isMultiPage: z.boolean().optional(),
  pageCount: z.number().optional(),
  description: z.string().optional(),
  selectedModel: z.string().optional(),
  providerId: z.string().optional(),
  favicon: z.string().optional(),
  deploymentUrl: z.string().optional(),
  repoUrl: z.string().optional(),
  deployProvider: z.string().optional(),
  deployedAt: z.coerce.number().optional(),
  netlifySiteName: z.string().optional(),
  seoData: z.array(z.object({
    path: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    ogImage: z.string().optional(),
  })).optional(),
}).passthrough();

export const projectFileRecordSchema = z.object({
  path: z.string(),
  content: z.string(),
  language: z.union([z.literal('html'), z.literal('css'), z.literal('javascript')]),
  fileType: z.union([z.literal('page'), z.literal('partial'), z.literal('style'), z.literal('script')]),
  createdAt: z.coerce.number().optional(),
  updatedAt: z.coerce.number().optional(),
}).passthrough();

export function normalizeProjectMetadata(record: unknown) {
  const parsed = projectRecordSchema.parse(record);
  return {
    name: parsed.projectName,
    prompt: parsed.prompt,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
    status: parsed.status,
    html: parsed.html,
    isPublished: parsed.isPublished,
    userId: parsed.userId,
    isMultiPage: parsed.isMultiPage,
    pageCount: parsed.pageCount,
    description: parsed.description,
    selectedModel: parsed.selectedModel,
    providerId: parsed.providerId,
    favicon: parsed.favicon,
    deploymentUrl: parsed.deploymentUrl,
    repoUrl: parsed.repoUrl,
    deployProvider: parsed.deployProvider,
    deployedAt: parsed.deployedAt,
    netlifySiteName: parsed.netlifySiteName,
    seoData: parsed.seoData,
  };
}
