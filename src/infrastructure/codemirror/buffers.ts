import { Compartment, EditorState, type Extension, type StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { BufferPort } from '../../application/ports';
import type { CursorPosition } from '../../domain/editor';
import { fileNameOf } from '../../domain/fs';
import { cursorOf } from './extensions';
import { languageFor } from './languages';

/**
 * `BufferPort` backed by CodeMirror. Every tab keeps its own `EditorState`, so
 * undo history and cursor survive tab switches, while a single `EditorView`
 * displays whichever buffer is shown. The view lives here so that nothing
 * outside this folder touches CodeMirror.
 */
export interface CodemirrorBuffers extends BufferPort {
  /** Create the editor view inside `host`. Returns a function that removes it again. */
  mount(host: HTMLElement): () => void;
  /** Display the buffer for `path`. Returns its cursor position, or `null` when there is nothing to show. */
  show(path: string | null): CursorPosition | null;
  focus(): void;
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
      states.set(
        path,
        EditorState.create({
          // Only `\n` breaks a line: a lone `\r` (old Mac files, captured progress
          // output) stays an ordinary character and is written back unchanged.
          doc: text.replace(/\r\n/g, '\n'),
          extensions: [EditorState.lineSeparator.of('\n'), ...extensionsFor(path), language.of([])],
        }),
      );
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

    mount(host) {
      const mounted = new EditorView({ parent: host });
      view = mounted;
      shownPath = null;
      return () => {
        stash();
        mounted.destroy();
        if (view === mounted) {
          view = null;
          shownPath = null;
        }
      };
    },

    show(path) {
      if (!view) return null;
      stash();
      const state = path === null ? undefined : states.get(path);
      shownPath = state ? path : null;
      if (!state || path === null) return null;
      view.setState(state);
      const scroll = scrolls.get(path);
      if (scroll) view.dispatch({ effects: scroll });
      return cursorOf(view.state);
    },

    focus() {
      view?.focus();
    },
  };
}
