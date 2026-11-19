import { Compartment, EditorState, type Extension, type StateEffect } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { BufferPort } from '../../application/ports';
import { fileNameOf } from '../../domain/fs';
import { languageFor } from './languages';

/**
 * `BufferPort` backed by CodeMirror. Every tab keeps its own `EditorState`, so
 * undo history and cursor survive tab switches, while a single `EditorView`
 * displays whichever buffer is shown.
 */
export interface CodemirrorBuffers extends BufferPort {
  /** Hand over the view that displays buffers. */
  attach(view: EditorView): void;
  /** Display the buffer for `path` in the attached view. Returns whether a buffer was shown. */
  show(path: string | null): boolean;
}

export function createCodemirrorBuffers(extensionsFor: (path: string) => Extension[]): CodemirrorBuffers {
  const states = new Map<string, EditorState>();
  /** Where each buffer was scrolled to when it was last on screen; `setState` does not carry that. */
  const scrolls = new Map<string, StateEffect<unknown>>();
  const language = new Compartment();
  let view: EditorView | null = null;
  let shownPath: string | null = null;

  /** The live state of a buffer: the view's when it is on screen, the stored one otherwise. */
  const current = (path: string): EditorState | undefined =>
    view && shownPath === path ? view.state : states.get(path);

  const stash = () => {
    if (!view || shownPath === null || !states.has(shownPath)) return;
    states.set(shownPath, view.state);
    scrolls.set(shownPath, view.scrollSnapshot());
  };

  const loadLanguage = async (path: string) => {
    const extension = await languageFor(fileNameOf(path)).catch(() => null);
    const state = current(path);
    if (!extension || !state) return;
    const spec = { effects: language.reconfigure(extension) };
    if (view && shownPath === path) view.dispatch(spec);
    else states.set(path, state.update(spec).state);
  };

  return {
    open(path, text) {
      states.set(path, EditorState.create({ doc: text, extensions: [...extensionsFor(path), language.of([])] }));
      scrolls.delete(path);
      if (shownPath === path) shownPath = null;
      void loadLanguage(path);
    },

    has: (path) => states.has(path),

    text: (path) => current(path)?.doc.toString() ?? '',

    close(path) {
      states.delete(path);
      scrolls.delete(path);
      if (shownPath === path) shownPath = null;
    },

    attach(next) {
      view = next;
      shownPath = null;
    },

    show(path) {
      if (!view) return false;
      stash();
      const state = path === null ? undefined : states.get(path);
      shownPath = state ? path : null;
      if (!state || path === null) return false;
      view.setState(state);
      const scroll = scrolls.get(path);
      if (scroll) view.dispatch({ effects: scroll });
      return true;
    },
  };
}
