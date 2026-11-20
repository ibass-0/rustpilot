import type { JSX } from 'solid-js';

function escapeHtml(value: string): string { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

export function markdownHtml(source: string): string {
  return source.split(/\r?\n/).map((line) => {
    const safe = escapeHtml(line);
    if (/^#{1,6}\s/.test(line)) { const level = line.match(/^#+/)![0].length; return `<h${level}>${safe.slice(level + 1)}</h${level}>`; }
    if (/^>\s?/.test(line)) return `<blockquote>${safe.replace(/^&gt;\s?/, '')}</blockquote>`;
    if (/^```/.test(line)) return `<pre><code>${safe.replace(/^```.*$/, '')}</code></pre>`;
    if (/^[-*]\s/.test(line)) return `<li>${safe.slice(2)}</li>`;
    if (/^\d+\.\s/.test(line)) return `<li>${safe.replace(/^\d+\.\s/, '')}</li>`;
    if (!line.trim()) return '<br />';
    return `<p>${safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/`(.+?)`/g, '<code>$1</code>')}</p>`;
  }).join('');
}

export function MarkdownPreview(props: { source: string }): JSX.Element {
  return <article class="markdown-preview" innerHTML={markdownHtml(props.source)} />;
}
