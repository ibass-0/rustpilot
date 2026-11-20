import type { EngineKind } from './dataSource';

export type CellValue = null | boolean | number | string;

export interface SqlColumn {
  name: string;
  typeName: string;
}

export interface SqlResult {
  columns: SqlColumn[];
  rows: CellValue[][];
  /** True when more rows matched than the 500 that were returned. */
  truncated: boolean;
  /** Set for statements that return no columns. */
  rowsAffected: number | null;
  elapsedMs: number;
}

export interface StatementRange {
  /** Offset of the first character. */
  from: number;
  /** Offset just past the last character, before the terminating semicolon. */
  to: number;
  text: string;
}

interface Segment extends StatementRange {
  /** Offset just past the terminating semicolon, or `to` when there is none. */
  end: number;
}

const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
const isWordChar = (c: string | undefined) => c !== undefined && /[A-Za-z0-9_$]/.test(c);

/** The offset just past the quoted run that starts at `i`, where `close` ends it and a doubled `close` escapes it. */
function skipQuoted(text: string, i: number, close: string, doubled: boolean): number {
  let j = i + 1;
  while (j < text.length) {
    if (text[j] === close) {
      if (doubled && text[j + 1] === close) {
        j += 2;
        continue;
      }
      return j + 1;
    }
    j++;
  }
  return text.length;
}

/** The offset just past a `$tag$ … $tag$` run starting at `i`, or `null` when `i` does not start one. */
function skipDollarQuote(text: string, i: number): number | null {
  if (isWordChar(text[i - 1])) return null;
  const open = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(text.slice(i, i + 64));
  if (!open) return null;
  const close = text.indexOf(open[0], i + open[0].length);
  return close === -1 ? text.length : close + open[0].length;
}

function scan(text: string): Segment[] {
  const segments: Segment[] = [];
  let start = 0;
  let hasCode = false;
  let i = 0;

  const finish = (stop: number, end: number) => {
    if (hasCode) {
      let from = start;
      while (from < stop && isSpace(text[from])) from++;
      let to = stop;
      while (to > from && isSpace(text[to - 1])) to--;
      segments.push({ from, to, end, text: text.slice(from, to) });
    }
    start = end;
    hasCode = false;
  };

  while (i < text.length) {
    const c = text[i];
    if (c === ';') {
      finish(i, i + 1);
      i++;
    } else if (c === "'") {
      hasCode = true;
      i = skipQuoted(text, i, "'", true);
    } else if (c === '"') {
      hasCode = true;
      i = skipQuoted(text, i, '"', true);
    } else if (c === '`') {
      hasCode = true;
      i = skipQuoted(text, i, '`', true);
    } else if (c === '[') {
      hasCode = true;
      i = skipQuoted(text, i, ']', true);
    } else if (c === '-' && text[i + 1] === '-') {
      const eol = text.indexOf('\n', i);
      i = eol === -1 ? text.length : eol + 1;
    } else if (c === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      i = close === -1 ? text.length : close + 2;
    } else if (c === '$') {
      const after = skipDollarQuote(text, i);
      hasCode = true;
      i = after ?? i + 1;
    } else {
      if (!isSpace(c)) hasCode = true;
      i++;
    }
  }
  finish(text.length, text.length);
  return segments;
}

/** Split `text` into statements. Semicolons inside strings, quoted names, comments and dollar quotes do not split. */
export function splitStatements(text: string): StatementRange[] {
  return scan(text).map(({ from, to, text: statement }) => ({ from, to, text: statement }));
}

/**
 * The statement the cursor is in. Right after a semicolon the cursor still
 * belongs to that statement; between statements it belongs to the previous one
 * when they share a line, otherwise to the next.
 */
export function statementAt(text: string, offset: number): StatementRange | null {
  const segments = scan(text);
  if (segments.length === 0) return null;
  const inside = segments.find((s) => offset >= s.from && offset <= s.end);
  const pick = (s: Segment): StatementRange => ({ from: s.from, to: s.to, text: s.text });
  if (inside) return pick(inside);
  const previous = [...segments].reverse().find((s) => s.end < offset);
  const next = segments.find((s) => s.from > offset);
  if (previous && !text.slice(previous.end, offset).includes('\n')) return pick(previous);
  const chosen = next ?? previous;
  return chosen ? pick(chosen) : null;
}

export function quoteIdentifier(engine: EngineKind, name: string): string {
  switch (engine) {
    case 'mysql':
    case 'mariadb':
      return `\`${name.replace(/`/g, '``')}\``;
    case 'mssql':
      return `[${name.replace(/]/g, ']]')}]`;
    default:
      return `"${name.replace(/"/g, '""')}"`;
  }
}

/** A query that reads the first 500 rows of a table. */
export function previewQuery(engine: EngineKind, schema: string, table: string): string {
  const target = `${quoteIdentifier(engine, schema)}.${quoteIdentifier(engine, table)}`;
  if (engine === 'mssql') return `SELECT TOP 500 * FROM ${target};`;
  return `SELECT * FROM ${target} LIMIT 500;`;
}

/** One line under the grid: how much came back and how long it took. */
export function resultSummary(result: SqlResult): string {
  const plural = (n: number) => (n === 1 ? 'row' : 'rows');
  if (result.rowsAffected !== null) {
    return `${result.rowsAffected} ${plural(result.rowsAffected)} affected in ${result.elapsedMs} ms`;
  }
  const count = result.rows.length;
  return `${count}${result.truncated ? '+' : ''} ${plural(count)} in ${result.elapsedMs} ms`;
}

/** How a cell reads in the grid. */
export function cellText(value: CellValue): string {
  return value === null ? 'NULL' : String(value);
}

/** Rows as tab-separated text for the clipboard. NULL is empty; text with tabs, line breaks or quotes is quoted. */
export function toTsv(rows: readonly (readonly CellValue[])[]): string {
  const field = (value: CellValue): string => {
    if (value === null) return '';
    const text = String(value);
    return /[\t\r\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return rows.map((row) => row.map(field).join('\t')).join('\n');
}
