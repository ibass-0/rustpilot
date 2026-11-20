import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import type { SideBySideSurface } from '../../presentation/editor/diffSurface';
import { fileNameOf } from '../../domain/fs';
import { languageFor } from './languages';
import { editorTheme } from './theme';

/**
 * Two read-only editors side by side with the changes between them highlighted. The merge package
 * is loaded the first time a side-by-side diff is opened.
 */
export const mergeViewSurface: SideBySideSurface = {
  async mount(host, original, modified, path) {
    const { MergeView } = await import('@codemirror/merge');
    const language = await languageFor(fileNameOf(path)).catch(() => null);
    const extensions = [
      lineNumbers(),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      editorTheme,
      ...(language ? [language] : []),
    ];
    const view = new MergeView({
      a: { doc: original, extensions },
      b: { doc: modified, extensions },
      parent: host,
      highlightChanges: true,
      gutter: true,
      collapseUnchanged: { margin: 3, minSize: 6 },
    });
    return () => view.destroy();
  },
};
