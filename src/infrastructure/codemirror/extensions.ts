import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, foldAll, foldGutter, foldKeymap, indentOnInput, unfoldAll } from '@codemirror/language';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { EditorSelection, EditorState, type Extension } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  Decoration,
  ViewPlugin,
  type ViewUpdate,
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

const indentRainbow = ViewPlugin.fromClass(class {
  decorations;
  constructor(view: EditorView) { this.decorations = this.build(view); }
  update(update: ViewUpdate) { if (update.docChanged || update.viewportChanged) this.decorations = this.build(update.view); }
  build(view: EditorView) {
    const marks = [] as ReturnType<typeof Decoration.line>[];
    for (const { from, to } of view.visibleRanges) {
      for (let position = from; position <= to;) {
        const line = view.state.doc.lineAt(position);
        const match = /^(\s+)/.exec(line.text);
        if (match) {
          const width = match[1].replace(/\t/g, '  ').length;
          const level = Math.min(6, Math.max(1, Math.ceil(width / 2)));
          marks.push(Decoration.line({ class: `cm-indent-level-${level}` }).range(line.from));
        }
        if (line.to >= to) break;
        position = line.to + 1;
      }
    }
    return Decoration.set(marks);
  }
}, { decorations: (value) => value.decorations });

/**
 * Everything a buffer needs besides its language: line numbers, history,
 * bracket matching, active line, search (Ctrl+F), Tab indentation and the theme.
 */
export function baseExtensions(
  onDocChanged: () => void,
  onCursor: (line: number, col: number) => void,
  /** Ctrl+Enter / Ctrl+Shift+Enter. Return `false` to leave the key to the editor. */
  onRun: (all: boolean) => boolean = () => false,
): Extension[] {
  return [
    lineNumbers(),
    indentRainbow,
    foldGutter({ openText: '⌄', closedText: '›' }),
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
      { key: 'Mod-Enter', run: () => onRun(false) },
      { key: 'Mod-Shift-Enter', run: () => onRun(true) },
      { key: 'Mod-d', run: selectNextOccurrence },
      { key: 'Mod-Shift-l', run: selectAllOccurrences },
      { key: 'Mod-Shift-]', run: foldAll },
      { key: 'Mod-Shift-[', run: unfoldAll },
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap,
      ...foldKeymap,
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
