import { describe, expect, it } from 'vitest';
import { assertCanAccessProject, canUserEditProject, isOrphanProject } from '@/lib/project-access';

describe('project-access', () => {
  it('allows owner', () => {
    expect(canUserEditProject({ userId: 'u1' }, 'u1')).toBe(true);
  });

  it('denies other users when owned', () => {
    expect(canUserEditProject({ userId: 'u1' }, 'u2')).toBe(false);
  });

  it('allows any signed-in user on orphan until claimed', () => {
    expect(canUserEditProject({}, 'u1')).toBe(true);
    expect(isOrphanProject({})).toBe(true);
  });

  it('assertCanAccessProject requires auth', () => {
    expect(assertCanAccessProject({ userId: 'u1' }, undefined)).toEqual({
      ok: false,
      status: 401,
      message: 'Authentication required',
    });
  });

  it('assertCanAccessProject returns 404 when project missing', () => {
    expect(assertCanAccessProject(null, 'u1')).toMatchObject({ ok: false, status: 404 });
  });
});