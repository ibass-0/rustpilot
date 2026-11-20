import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
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
    keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
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
