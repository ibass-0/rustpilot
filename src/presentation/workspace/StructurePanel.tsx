import { For, Show, type JSX } from 'solid-js';
import { editor } from '../../application/editorStore';
import { fileNameOf } from '../../domain/fs';
import { symbolsFor, type DocumentSymbol } from '../../domain/symbols';
import type { EditorSurface } from '../editor/EditorPane';

export function StructurePanel(props: { surface: EditorSurface }): JSX.Element {
  const symbols = (): DocumentSymbol[] => { const path = editor.activePath; return path ? symbolsFor(props.surface.text(path), fileNameOf(path)) : []; };
  return <div class="structure-panel"><Show when={editor.activePath} fallback={<div class="empty-state">Open a file to view its outline.</div>}><div class="breadcrumbs">{editor.activePath}</div><Show when={symbols().length} fallback={<div class="empty-state">No symbols in this file.</div>}><div class="structure-list"><For each={symbols()}>{(symbol) => <button type="button" class="structure-item" style={{ 'padding-left': `${8 + symbol.depth * 12}px` }} onClick={() => props.surface.revealLine(symbol.line)}><span class={`structure-kind structure-kind-${symbol.kind}`}>{symbol.kind.slice(0, 1).toUpperCase()}</span><span>{symbol.name}</span><small>:{symbol.line}</small></button>}</For></div></Show></Show></div>;
}
