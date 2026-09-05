import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

function catalogResponse(
  models: Array<{ id?: string; name?: string; architecture?: { modality?: string } }>,
) {
  return {
    ok: true,
    json: async () => ({ data: models }),
  };
}

async function loadFresh() {
  vi.resetModules();
  return import('@/lib/openrouter-models');
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchOpenRouterFreeModels', () => {
  it('keeps only free text-output models with API names', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      catalogResponse([
        { id: 'paid/model', name: 'Paid' },
        { id: 'z-ai/glm-5:free', name: 'GLM 5 Free', architecture: { modality: 'text->text' } },
        { id: 'audio/lyria:free', name: 'Lyria', architecture: { modality: 'audio->audio' } },
        { id: 'mystery/model:free' },
        { id: 'z-ai/glm-5:free', name: 'GLM duplicate' },
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { fetchOpenRouterFreeModels } = await loadFresh();

    const models = await fetchOpenRouterFreeModels();
    expect(models).toEqual([
      { id: 'z-ai/glm-5:free', name: 'GLM 5 Free' },
      { id: 'mystery/model:free', name: 'mystery/model:free' },
    ]);
  });

  it('caches the catalog within the TTL window', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      catalogResponse([{ id: 'cached/model:free', name: 'Cached' }]),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { fetchOpenRouterFreeModels } = await loadFresh();

    await fetchOpenRouterFreeModels();
    await fetchOpenRouterFreeModels();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns an empty list when the catalog is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const { fetchOpenRouterFreeModels } = await loadFresh();

    expect(await fetchOpenRouterFreeModels()).toEqual([]);
  });
});

describe('resolveOpenRouterModel', () => {
  it('falls back on empty selection and passes the auto router through', async () => {
    const { resolveOpenRouterModel } = await loadFresh();
    expect(await resolveOpenRouterModel('')).toBe('openrouter/free');
    expect(await resolveOpenRouterModel('openrouter/free')).toBe('openrouter/free');
  });

  it('falls back when the stored model left the free catalog', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(catalogResponse([{ id: 'new/model:free', name: 'New' }])),
    );
    const { resolveOpenRouterModel } = await loadFresh();

    expect(await resolveOpenRouterModel('retired/model:free')).toBe('openrouter/free');
    expect(await resolveOpenRouterModel('new/model:free')).toBe('new/model:free');
  });

  it('fails open when the catalog cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const { resolveOpenRouterModel } = await loadFresh();

    expect(await resolveOpenRouterModel('stale/model:free')).toBe('stale/model:free');
  });
});
