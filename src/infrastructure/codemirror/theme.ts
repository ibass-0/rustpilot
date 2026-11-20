import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

// Syntax colours follow the JetBrains dark scheme; surfaces come from tokens.css.
const chrome = EditorView.theme(
  {
    '&': {
      height: '100%',
      color: '#bcbec4',
      backgroundColor: 'var(--bg-editor)',
      fontSize: 'var(--font-size-code)',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      fontFamily: 'var(--font-mono)',
      lineHeight: '1.55',
      overflow: 'auto',
    },
    '.cm-content': {
      padding: '6px 0', caretColor: '#ced0d6', userSelect: 'text',
      backgroundImage: 'repeating-linear-gradient(90deg, transparent 0, transparent 23px, rgba(120, 150, 220, .13) 23px, rgba(120, 150, 220, .13) 24px)',
      backgroundPosition: '18px 0',
    },
    '.cm-line': { padding: '0 12px 0 6px' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#ced0d6', borderLeftWidth: '2px' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: '#214283',
    },
    '.cm-content ::selection': { backgroundColor: '#214283' },
    '.cm-activeLine': { backgroundColor: '#23252a' },
    '.cm-gutters': {
      backgroundColor: 'var(--bg-editor)',
      color: '#4b5059',
      border: 'none',
      userSelect: 'none',
    },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 16px', minWidth: '40px' },
    '.cm-foldGutter': { width: '18px', color: '#6f737d' },
    '.cm-foldGutter .cm-gutterElement': { padding: '0 2px', cursor: 'pointer' },
    '.cm-foldGutter .cm-gutterElement:hover': { color: '#f0a06a' },
    '.cm-activeLineGutter': { backgroundColor: '#23252a', color: '#a1a3ab' },
    '&.cm-focused .cm-matchingBracket, .cm-matchingBracket': {
      backgroundColor: '#3d4656',
      color: '#f4c36a',
      outline: '1px solid #6b7892',
    },
    '.cm-nonmatchingBracket': { backgroundColor: 'transparent', color: '#f75464' },
    '.cm-selectionMatch': { backgroundColor: '#373b39' },
    '.cm-searchMatch': { backgroundColor: '#2d543f', outline: 'none' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: '#32593d', outline: '1px solid #57965c' },
    '.cm-panels': {
      backgroundColor: 'var(--bg-panel)',
      color: 'var(--text)',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--font-size-ui)',
    },
    '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
    '.cm-panel.cm-search': { padding: '6px 10px', userSelect: 'none' },
    '.cm-panel.cm-search label': { color: 'var(--text-muted)', fontSize: 'var(--font-size-small)' },
    '.cm-textfield': {
      height: '24px',
      padding: '0 6px',
      border: '1px solid var(--border-strong)',
      borderRadius: 'var(--radius-small)',
      backgroundColor: 'var(--bg-editor)',
      color: 'var(--text)',
      fontSize: 'var(--font-size-ui)',
      userSelect: 'text',
    },
    '.cm-textfield:focus': { borderColor: 'var(--accent)', outline: 'none' },
    '.cm-button': {
      height: '24px',
      padding: '0 10px',
      border: '1px solid var(--border-strong)',
      borderRadius: 'var(--radius-small)',
      backgroundImage: 'none',
      backgroundColor: 'transparent',
      color: 'var(--text)',
      fontSize: 'var(--font-size-small)',
    },
    '.cm-button:hover': { backgroundColor: 'var(--bg-hover)' },
    '.cm-panel.cm-search [name=close]': { color: 'var(--text-muted)', fontSize: '16px', cursor: 'pointer' },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.operatorKeyword, t.controlKeyword, t.definitionKeyword], color: '#cf8e6d' },
  { tag: [t.bool, t.null, t.atom, t.self], color: '#cf8e6d' },
  { tag: [t.string, t.special(t.string), t.character], color: '#6aab73' },
  { tag: [t.regexp, t.escape], color: '#42c3d4' },
  { tag: [t.number, t.integer, t.float], color: '#2aacb8' },
  { tag: [t.lineComment, t.blockComment, t.comment], color: '#7a7e85' },
  { tag: t.docComment, color: '#5f826b', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: '#56a8f5' },
  { tag: [t.definition(t.function(t.variableName))], color: '#56a8f5' },
  { tag: [t.typeName, t.className, t.namespace], color: '#6fafbd' },
  { tag: [t.propertyName, t.attributeName], color: '#c77dbb' },
  { tag: [t.tagName, t.angleBracket], color: '#d5b778' },
  { tag: [t.meta, t.annotation, t.processingInstruction], color: '#b3ae60' },
  { tag: t.heading, color: '#d5b778', fontWeight: '600' },
  { tag: t.strong, fontWeight: '600' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: [t.link, t.url], color: '#548af7', textDecoration: 'underline' },
  { tag: t.invalid, color: '#f75464' },
]);

export const editorTheme: Extension = [chrome, syntaxHighlighting(highlight)];
