/**
 * Build targets.
 *
 * Every project in the factory compiles to one of exactly two shapes, and the
 * shape is derived from the files rather than stored as a mode the user has to
 * keep in sync:
 *
 *   static  assets only. HTML, CSS, browser JS. Uploaded to Cloudflare Pages
 *           as a plain asset bundle. No Worker, no bindings, nothing billable
 *           beyond the free static tier.
 *
 *   edge    the same asset bundle plus `_worker.js` and, optionally, a
 *           `cloudflare.manifest.json` declaring D1 / KV / R2 / Queues /
 *           Vectorize / Durable Object bindings. Cloudflare provisions those
 *           on deploy, and only after an explicit confirmation.
 *
 * Cloudflare is the primary target for both. Everything else (a GitHub mirror,
 * a downloaded zip) is an export of the same bundle, which is what keeps
 * generated projects portable.
 */

import type { ProjectFile } from './page-builder'

export type BuildTarget = 'static' | 'edge'

/** File kinds that only ever exist in an edge project. */
const EDGE_FILE_TYPES = new Set<ProjectFile['fileType']>(['worker', 'migration', 'config'])

export type TargetSpec = {
  id: BuildTarget
  /** Shown wherever the user picks or reads a target. */
  label: string
  /** One line, no marketing. What the user actually gets. */
  summary: string
  /** Where it runs once deployed. */
  runtime: string
  /** What the deploy creates. Drives the confirmation copy. */
  provisions: string
  /** File kinds this target is allowed to contain. */
  fileTypes: ReadonlyArray<ProjectFile['fileType']>
}

export const TARGETS: Record<BuildTarget, TargetSpec> = {
  static: {
    id: 'static',
    label: 'Static site',
    summary: 'Pages, styles, and browser scripts. No server, no database.',
    runtime: 'Cloudflare Pages assets',
    provisions: 'Nothing billable. Assets are uploaded to the free static tier.',
    fileTypes: ['page', 'partial', 'style', 'script'],
  },
  edge: {
    id: 'edge',
    label: 'Edge app',
    summary: 'A static front end plus a Worker backend and Cloudflare data services.',
    runtime: 'Cloudflare Workers, D1, KV, R2, Queues',
    provisions:
      'Creates the Worker and any bindings declared in cloudflare.manifest.json. You confirm each resource before it is created.',
    fileTypes: ['page', 'partial', 'style', 'script', 'worker', 'migration', 'config'],
  },
}

export const TARGET_ORDER: ReadonlyArray<BuildTarget> = ['static', 'edge']

/**
 * Read the target off the files. A project is an edge app the moment it has a
 * Worker, a migration, or a wrangler/manifest config; otherwise it is static.
 *
 * Derived rather than declared so a project that grows a `_worker.js` mid-way
 * through a conversation is immediately treated as an edge app, without the
 * user having to go and flip a setting they will not think to look for.
 */
export function inferTarget(files: Pick<ProjectFile, 'path' | 'fileType'>[]): BuildTarget {
  for (const file of files) {
    if (EDGE_FILE_TYPES.has(file.fileType)) return 'edge'
    if (file.path === '_worker.js' || file.path.startsWith('workers/')) return 'edge'
  }
  return 'static'
}

/** The stored value wins when present; otherwise infer. */
export function resolveTarget(
  stored: string | null | undefined,
  files: Pick<ProjectFile, 'path' | 'fileType'>[]
): BuildTarget {
  if (stored === 'static' || stored === 'edge') return stored
  return inferTarget(files)
}

export function targetSpec(target: BuildTarget): TargetSpec {
  return TARGETS[target]
}

/**
 * Deploy surfaces, in the order they are offered.
 *
 * Cloudflare production is first and is the default. The in-app preview is
 * second because it is the zero-commitment way to look at a build. GitHub is a
 * mirror of the same bundle, not an alternative host, and is labelled that way
 * so nobody expects a push to publish anything on its own.
 */
export type DeploySurfaceId = 'cloudflare' | 'cloudflare-preview' | 'github-only' | 'github-netlify' | 'maf-hosted'

export type DeploySurface = {
  id: DeploySurfaceId
  label: string
  detail: string
  /** Accounts that must be connected before this surface can run. */
  requires: ReadonlyArray<'cloudflare' | 'github' | 'netlify'>
  /** Targets this surface can actually host. */
  supports: ReadonlyArray<BuildTarget>
  /** True when running it can create persistent or billable cloud resources. */
  provisions: boolean
  primary?: boolean
}

export const DEPLOY_SURFACES: ReadonlyArray<DeploySurface> = [
  {
    id: 'cloudflare',
    label: 'Cloudflare',
    detail: 'Publish to Pages. Edge apps also get their Worker and bindings.',
    requires: ['cloudflare'],
    supports: ['static', 'edge'],
    provisions: true,
    primary: true,
  },
  {
    id: 'cloudflare-preview',
    label: 'Cloudflare preview',
    detail: 'A throwaway deployment on its own subdomain. Expires on its own.',
    requires: ['cloudflare'],
    supports: ['static', 'edge'],
    provisions: true,
  },
  {
    id: 'maf-hosted',
    label: 'Factory preview',
    detail: 'Served from this app. No account needed, static output only.',
    requires: [],
    supports: ['static'],
    provisions: false,
  },
  {
    id: 'github-only',
    label: 'GitHub mirror',
    detail: 'Push the same bundle to a repo. Does not host anything.',
    requires: ['github'],
    supports: ['static', 'edge'],
    provisions: false,
  },
  {
    id: 'github-netlify',
    label: 'Netlify',
    detail: 'Mirror to GitHub, then host the assets on Netlify. Static output only.',
    requires: ['github', 'netlify'],
    supports: ['static'],
    provisions: false,
  },
]

export function deploySurface(id: DeploySurfaceId): DeploySurface {
  const found = DEPLOY_SURFACES.find((surface) => surface.id === id)
  if (!found) throw new Error(`Unknown deploy surface: ${id}`)
  return found
}

/** Surfaces that can host the given target, primary first. */
export function surfacesFor(target: BuildTarget): DeploySurface[] {
  return DEPLOY_SURFACES.filter((surface) => surface.supports.includes(target))
}

/** Cloudflare is the default for every target. */
export const DEFAULT_DEPLOY_SURFACE: DeploySurfaceId = 'cloudflare'
