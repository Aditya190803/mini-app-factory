import { describe, expect, test } from 'vitest';
import { collapseGatewayEffortModels } from '@/lib/gateway-model-catalog';

describe('collapseGatewayEffortModels', () => {
  test('keeps one entry per family and prefers medium', () => {
    const collapsed = collapseGatewayEffortModels([
      { id: 'gemini-3.6-flash-low', name: 'x' },
      { id: 'gemini-3.6-flash-medium', name: 'x' },
      { id: 'gemini-3.6-flash-high', name: 'x' },
      { id: 'claude-sonnet-4-6', name: 'x' },
      { id: 'claude-opus-4-6-thinking', name: 'x' },
      { id: 'tab_flash_lite_preview', name: 'x' },
      { id: 'chat_20706', name: 'x' },
      { id: 'gemini-3.1-flash-image', name: 'x' },
    ]);

    const ids = collapsed.map((model) => model.id);
    expect(ids).toContain('gemini-3.6-flash-medium');
    expect(ids).toContain('claude-sonnet-4-6');
    expect(ids).toContain('claude-opus-4-6-thinking');
    expect(ids).not.toContain('gemini-3.6-flash-low');
    expect(ids).not.toContain('gemini-3.6-flash-high');
    expect(ids).not.toContain('tab_flash_lite_preview');
    expect(ids).not.toContain('chat_20706');
    expect(ids).not.toContain('gemini-3.1-flash-image');
    expect(collapsed.find((model) => model.id.startsWith('gemini-3.6'))?.name).toBe('Gemini 3.6 Flash');
  });
});
