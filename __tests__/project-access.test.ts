import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/stack/server', () => ({ stackServerApp: { getUser: vi.fn() } }));
vi.mock('@/lib/projects', () => ({ getProject: vi.fn() }));

import { assertProjectRole, hasProjectRole, requireProjectRole } from '@/lib/project-access';

describe('project-access', () => {
  it('ranks roles owner > editor > viewer', () => {
    expect(hasProjectRole('owner', 'owner')).toBe(true);
    expect(hasProjectRole('owner', 'viewer')).toBe(true);
    expect(hasProjectRole('editor', 'editor')).toBe(true);
    expect(hasProjectRole('editor', 'owner')).toBe(false);
    expect(hasProjectRole('viewer', 'editor')).toBe(false);
    expect(hasProjectRole(undefined, 'viewer')).toBe(false);
  });

  it('requires auth', () => {
    expect(assertProjectRole({ accessRole: 'owner' }, undefined, 'viewer')).toMatchObject({ ok: false, status: 401 });
  });

  it('returns 404 when the project is missing or not shared with the caller', () => {
    expect(assertProjectRole(null, 'u1', 'viewer')).toMatchObject({ ok: false, status: 404 });
  });

  it('lets editors edit but not do owner-only work', () => {
    const project = { accessRole: 'editor' as const };
    expect(assertProjectRole(project, 'u1', 'editor')).toMatchObject({ ok: true });
    expect(assertProjectRole(project, 'u1', 'owner')).toMatchObject({ ok: false, status: 403 });
  });

  it('keeps viewers read-only', () => {
    const project = { accessRole: 'viewer' as const };
    expect(assertProjectRole(project, 'u1', 'viewer')).toMatchObject({ ok: true });
    expect(assertProjectRole(project, 'u1', 'editor')).toMatchObject({ ok: false, status: 403 });
  });

  it('requireProjectRole returns a ready response on denial', async () => {
    const { stackServerApp } = await import('@/stack/server');
    const { getProject } = await import('@/lib/projects');
    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    (getProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ name: 'p', accessRole: 'viewer' });
    const result = await requireProjectRole('p', 'owner');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect(await result.response.json()).toMatchObject({ code: 'FORBIDDEN' });
    }
  });
});
