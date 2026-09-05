import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DEPLOY_SURFACE,
  DEPLOY_SURFACES,
  deploySurface,
  inferTarget,
  resolveTarget,
  surfacesFor,
  TARGETS,
} from '@/lib/targets'
import type { ProjectFile } from '@/lib/page-builder'

const file = (
  path: string,
  fileType: ProjectFile['fileType']
): Pick<ProjectFile, 'path' | 'fileType'> => ({ path, fileType })

describe('inferTarget', () => {
  it('calls an assets-only project static', () => {
    expect(
      inferTarget([
        file('index.html', 'page'),
        file('styles.css', 'style'),
        file('app.js', 'script'),
        file('nav.html', 'partial'),
      ])
    ).toBe('static')
  })

  it('is static for an empty project', () => {
    expect(inferTarget([])).toBe('static')
  })

  it.each([
    ['a worker', file('_worker.js', 'worker')],
    ['a migration', file('migrations/0001_init.sql', 'migration')],
    ['a config', file('cloudflare.manifest.json', 'config')],
  ])('promotes to edge on %s', (_label, edgeFile) => {
    expect(inferTarget([file('index.html', 'page'), edgeFile])).toBe('edge')
  })

  it('promotes on the path alone when the file type was mislabelled', () => {
    // A generator that writes _worker.js but tags it as a script would
    // otherwise deploy as a static site and silently drop the backend.
    expect(inferTarget([file('_worker.js', 'script')])).toBe('edge')
    expect(inferTarget([file('workers/queue.js', 'script')])).toBe('edge')
  })
})

describe('resolveTarget', () => {
  it('prefers the stored value', () => {
    expect(resolveTarget('edge', [file('index.html', 'page')])).toBe('edge')
  })

  it('falls back to inference for rows written before targets existed', () => {
    expect(resolveTarget(undefined, [file('_worker.js', 'worker')])).toBe('edge')
    expect(resolveTarget(null, [file('index.html', 'page')])).toBe('static')
  })

  it('ignores a stored value that is not a target', () => {
    expect(resolveTarget('nonsense', [file('_worker.js', 'worker')])).toBe('edge')
  })
})

describe('deploy surfaces', () => {
  it('defaults to Cloudflare', () => {
    expect(DEFAULT_DEPLOY_SURFACE).toBe('cloudflare')
    expect(deploySurface(DEFAULT_DEPLOY_SURFACE).primary).toBe(true)
  })

  it('offers Cloudflare first for both targets', () => {
    expect(surfacesFor('static')[0].id).toBe('cloudflare')
    expect(surfacesFor('edge')[0].id).toBe('cloudflare')
  })

  it('never offers an edge app a surface that cannot run a Worker', () => {
    const edgeSurfaces = surfacesFor('edge').map((surface) => surface.id)
    expect(edgeSurfaces).not.toContain('maf-hosted')
    expect(edgeSurfaces).not.toContain('github-netlify')
  })

  it('marks every surface that can create billable resources', () => {
    // The deploy dialog gates on this flag, so a surface that provisions
    // without declaring it would skip the confirmation entirely.
    for (const surface of DEPLOY_SURFACES) {
      if (surface.requires.includes('cloudflare')) expect(surface.provisions).toBe(true)
      else expect(surface.provisions).toBe(false)
    }
  })

  it('throws on an unknown surface rather than returning undefined', () => {
    // @ts-expect-error deliberately invalid
    expect(() => deploySurface('heroku')).toThrow()
  })
})

describe('target specs', () => {
  it('keeps edge file kinds out of a static project', () => {
    expect(TARGETS.static.fileTypes).not.toContain('worker')
    expect(TARGETS.static.fileTypes).not.toContain('migration')
    expect(TARGETS.edge.fileTypes).toContain('worker')
  })
})
