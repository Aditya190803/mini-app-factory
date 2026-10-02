'use client';

import { useEffect, useRef } from 'react';

type Handlers = {
  save: () => void;
  toggleExplorer: () => void;
  toggleChat: () => void;
  quickOpen: () => void;
};

/**
 * Workspace keyboard shortcuts.
 *
 * Registered once; the handlers are read through a ref. The listener used to re-register on every
 * keystroke because its dependency list included the files array.
 *
 * Shortcuts were also switched off whenever focus was in a textarea, and Monaco's input is a
 * textarea — so inside the editor Ctrl+P fell through to the browser's print dialog. Monaco binds
 * none of these keys, so they now work there; plain form fields still only get Ctrl+S and Ctrl+P.
 */
export function useEditorShortcuts(handlers: Handlers) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  }, [handlers]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const target = event.target instanceof Element ? event.target : null;
      const inMonaco = Boolean(target?.closest('.monaco-editor'));
      const inField = !inMonaco && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.closest('[contenteditable="true"]'));

      if (key === 's') {
        event.preventDefault();
        ref.current.save();
      } else if (key === 'p' && !event.shiftKey) {
        event.preventDefault();
        ref.current.quickOpen();
      } else if (!inField && key === 'b') {
        event.preventDefault();
        ref.current.toggleExplorer();
      } else if (!inField && key === 'i') {
        event.preventDefault();
        ref.current.toggleChat();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
