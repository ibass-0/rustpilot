import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { EditorSelection, EditorState, type Extension } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { editorTheme } from './theme';

/** One-based line and column of the main cursor. */
export function cursorOf(state: EditorState): { line: number; col: number } {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  return { line: line.number, col: head - line.from + 1 };
}

function selectNextOccurrence(view: EditorView): boolean {
  const { state } = view;
  const main = state.selection.main;
  if (main.empty) return false;
  const query = state.sliceDoc(main.from, main.to);
  const start = main.to < state.doc.length ? main.to : 0;
  const next = state.sliceDoc(start).indexOf(query);
  const from = next < 0 ? state.sliceDoc(0, start).indexOf(query) : start + next;
  if (from < 0 || state.selection.ranges.some((range) => range.from === from && range.to === from + query.length)) return false;
  view.dispatch({ selection: EditorSelection.create([...state.selection.ranges, EditorSelection.range(from, from + query.length)], state.selection.ranges.length) });
  return true;
}

function selectAllOccurrences(view: EditorView): boolean {
  const { state } = view;
  const main = state.selection.main;
  if (main.empty) return false;
  const query = state.sliceDoc(main.from, main.to);
  const ranges = [] as ReturnType<typeof EditorSelection.range>[];
  let from = 0;
  while (from <= state.doc.length - query.length) {
    const found = state.sliceDoc(from).indexOf(query);
    if (found < 0) break;
    const start = from + found;
    ranges.push(EditorSelection.range(start, start + query.length));
    from = start + query.length;
  }
  if (!ranges.length) return false;
  view.dispatch({ selection: EditorSelection.create(ranges, 0) });
  return true;
}

/**
 * Everything a buffer needs besides its language: line numbers, history,
 * bracket matching, active line, search (Ctrl+F), Tab indentation and the theme.
 */
export function baseExtensions(onDocChanged: () => void, onCursor: (line: number, col: number) => void): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    history(),
    drawSelection(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    keymap.of([
      { key: 'Mod-d', run: selectNextOccurrence },
      { key: 'Mod-Shift-l', run: selectAllOccurrences },
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
    ]),
    editorTheme,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onDocChanged();
      if (update.docChanged || update.selectionSet) {
        const { line, col } = cursorOf(update.state);
        onCursor(line, col);
      }
    }),
  ];
}
