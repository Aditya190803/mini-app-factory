import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/stack/server', () => ({
  stackServerApp: { getUser: vi.fn() },
}));

vi.mock('@/lib/projects', () => ({
  getProject: vi.fn(),
}));

import { GET } from '@/app/api/project/[name]/route';
import { stackServerApp } from '@/stack/server';
import { getProject } from '@/lib/projects';

describe('GET /api/project/[name]', () => {
  beforeEach(() => {
    vi.mocked(stackServerApp.getUser).mockReset();
    vi.mocked(getProject).mockReset();
  });

  it('returns 401 when not signed in', async () => {
    vi.mocked(stackServerApp.getUser).mockResolvedValue(null);
    vi.mocked(getProject).mockResolvedValue({ name: 'p', prompt: 'x', status: 'completed', createdAt: 1 } as never);

    const res = await GET(new Request('http://x'), { params: Promise.resolve({ name: 'p' }) });
    expect(res.status).toBe(401);
  });

  it('returns 403 for another users project', async () => {
    vi.mocked(stackServerApp.getUser).mockResolvedValue({ id: 'u2' } as never);
    vi.mocked(getProject).mockResolvedValue({
      name: 'p',
      prompt: 'x',
      status: 'completed',
      createdAt: 1,
      userId: 'u1',
    } as never);

    const res = await GET(new Request('http://x'), { params: Promise.resolve({ name: 'p' }) });
    expect(res.status).toBe(403);
  });

  it('returns project for owner', async () => {
    vi.mocked(stackServerApp.getUser).mockResolvedValue({ id: 'u1' } as never);
    vi.mocked(getProject).mockResolvedValue({
      name: 'p',
      prompt: 'x',
      status: 'completed',
      createdAt: 1,
      userId: 'u1',
    } as never);

    const res = await GET(new Request('http://x'), { params: Promise.resolve({ name: 'p' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('u1');
  });
});