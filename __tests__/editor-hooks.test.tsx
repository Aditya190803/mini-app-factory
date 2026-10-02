// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFileHistory } from '@/hooks/use-file-history';
import { useEditorShortcuts } from '@/hooks/use-editor-shortcuts';
import type { ProjectFile } from '@/lib/page-builder';

const files = (label: string): ProjectFile[] => [{ path: 'index.html', content: label, language: 'html', fileType: 'page' }];

describe('useFileHistory', () => {
  it('undoes and redoes in order, and a new edit drops the redo branch', () => {
    const setFiles = vi.fn();
    const { result } = renderHook(() => useFileHistory(setFiles));
    act(() => result.current.resetHistory(files('a')));
    act(() => result.current.addToHistory(files('b')));
    act(() => result.current.addToHistory(files('c')));
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(setFiles).toHaveBeenLastCalledWith(files('b'));
    act(() => result.current.undo());
    expect(setFiles).toHaveBeenLastCalledWith(files('a'));
    expect(result.current.canUndo).toBe(false);

    act(() => result.current.redo());
    expect(setFiles).toHaveBeenLastCalledWith(files('b'));

    // Edit after undo: "c" is gone from redo.
    act(() => result.current.addToHistory(files('d')));
    expect(result.current.canRedo).toBe(false);
    act(() => result.current.undo());
    expect(setFiles).toHaveBeenLastCalledWith(files('b'));
  });

  it('a stale addToHistory reference still appends at the current position', () => {
    const setFiles = vi.fn();
    const { result } = renderHook(() => useFileHistory(setFiles));
    act(() => result.current.resetHistory(files('a')));
    // Captured before the next renders, like a callback memoised in a child component.
    const staleAdd = result.current.addToHistory;
    act(() => result.current.addToHistory(files('b')));
    act(() => staleAdd(files('c')));
    act(() => result.current.undo());
    expect(setFiles).toHaveBeenLastCalledWith(files('b'));
  });
});

describe('useEditorShortcuts', () => {
  const press = (target: EventTarget, key: string) => {
    const event = new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };

  it('handles Ctrl+P inside Monaco instead of letting the browser print', () => {
    const quickOpen = vi.fn();
    renderHook(() => useEditorShortcuts({ save: vi.fn(), toggleExplorer: vi.fn(), toggleChat: vi.fn(), quickOpen }));
    const editor = document.createElement('div');
    editor.className = 'monaco-editor';
    const textarea = document.createElement('textarea');
    editor.appendChild(textarea);
    document.body.appendChild(editor);
    const event = press(textarea, 'p');
    expect(quickOpen).toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    editor.remove();
  });

  it('leaves Ctrl+B to ordinary form fields', () => {
    const toggleExplorer = vi.fn();
    renderHook(() => useEditorShortcuts({ save: vi.fn(), toggleExplorer, toggleChat: vi.fn(), quickOpen: vi.fn() }));
    const input = document.createElement('input');
    document.body.appendChild(input);
    press(input, 'b');
    expect(toggleExplorer).not.toHaveBeenCalled();
    press(document.body, 'b');
    expect(toggleExplorer).toHaveBeenCalledTimes(1);
    input.remove();
  });

  it('registers one listener for the life of the component', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const handlers = { save: vi.fn(), toggleExplorer: vi.fn(), toggleChat: vi.fn(), quickOpen: vi.fn() };
    const { rerender } = renderHook((props) => useEditorShortcuts(props), { initialProps: handlers });
    rerender({ ...handlers, save: vi.fn() });
    rerender({ ...handlers, save: vi.fn() });
    expect(add.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);
    add.mockRestore();
  });
});
