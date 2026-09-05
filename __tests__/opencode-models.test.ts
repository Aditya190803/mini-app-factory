import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

function catalogResponse(ids: string[]) {
  return {
    ok: true,
    json: async () => ({ object: 'list', data: ids.map((id) => ({ id, object: 'model' })) }),
  };
}

async function loadFresh() {
  vi.resetModules();
  return import('@/lib/opencode-models');
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchOpenCodeFreeModels', () => {
  it('keeps only free models with prettified names', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      catalogResponse(['gpt-5.5', 'deepseek-v4-flash-free', 'big-pickle', 'deepseek-v4-flash-free']),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { fetchOpenCodeFreeModels } = await loadFresh();

    const models = await fetchOpenCodeFreeModels();
    expect(models).toEqual([
      { id: 'big-pickle', name: 'Big Pickle' },
      { id: 'deepseek-v4-flash-free', name: 'Deepseek V4 Flash Free' },
    ]);
  });

  it('caches the catalog within the TTL window', async () => {
    const fetchMock = vi.fn().mockResolvedValue(catalogResponse(['cached-free']));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchOpenCodeFreeModels } = await loadFresh();

    await fetchOpenCodeFreeModels();
    await fetchOpenCodeFreeModels();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns an empty list when the catalog is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const { fetchOpenCodeFreeModels } = await loadFresh();

    expect(await fetchOpenCodeFreeModels()).toEqual([]);
  });
});

describe('resolveOpenCodeModel', () => {
  it('falls back on empty selection', async () => {
    const { resolveOpenCodeModel } = await loadFresh();
    expect(await resolveOpenCodeModel('')).toBe('deepseek-v4-flash-free');
  });

  it('keeps a stored model that is still free and swaps a retired one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(catalogResponse(['new-model-free', 'deepseek-v4-flash-free'])),
    );
    const { resolveOpenCodeModel } = await loadFresh();

    expect(await resolveOpenCodeModel('new-model-free')).toBe('new-model-free');
    expect(await resolveOpenCodeModel('retired-model-free')).toBe('deepseek-v4-flash-free');
  });

  it('fails open when the catalog cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const { resolveOpenCodeModel } = await loadFresh();

    expect(await resolveOpenCodeModel('stale-model-free')).toBe('stale-model-free');
  });
});
