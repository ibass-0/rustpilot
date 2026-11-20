import { describe, expect, test } from 'vitest';
import {
  cellText,
  previewQuery,
  quoteIdentifier,
  resultSummary,
  splitStatements,
  statementAt,
  toTsv,
  type SqlResult,
} from '../../src/domain/sql';

const texts = (sql: string) => splitStatements(sql).map((s) => s.text);

describe('splitStatements', () => {
  test('splits on semicolons and trims', () => {
    expect(texts('select 1;  select 2;\n\nselect 3')).toEqual(['select 1', 'select 2', 'select 3']);
  });

  test('reports the range of each statement', () => {
    const sql = 'select 1;\nselect 2;';
    const [a, b] = splitStatements(sql);
    expect(sql.slice(a.from, a.to)).toBe('select 1');
    expect(sql.slice(b.from, b.to)).toBe('select 2');
  });

  test('keeps semicolons inside strings, with doubled quotes', () => {
    expect(texts("select 'a;b', 'it''s; ok'; select 2")).toEqual(["select 'a;b', 'it''s; ok'", 'select 2']);
  });

  test('keeps semicolons inside quoted identifiers', () => {
    expect(texts('select "a;b"; select `c;d`; select [e;f]')).toEqual([
      'select "a;b"',
      'select `c;d`',
      'select [e;f]',
    ]);
  });

  test('keeps semicolons inside comments', () => {
    expect(texts('select 1 -- a; b\n; /* c; d */ select 2')).toEqual(['select 1 -- a; b', '/* c; d */ select 2']);
  });

  test('keeps semicolons inside dollar quotes', () => {
    const body = 'create function f() returns int as $$ begin select 1; return 1; end $$ language sql';
    expect(texts(`${body}; select 2`)).toEqual([body, 'select 2']);
    expect(texts('select $tag$a;b$tag$; select 2')).toEqual(['select $tag$a;b$tag$', 'select 2']);
  });

  test('a dollar sign inside a word is not a dollar quote', () => {
    expect(texts('select a$b; select 2')).toEqual(['select a$b', 'select 2']);
  });

  test('drops empty and comment-only statements', () => {
    expect(texts(';;  ; -- nothing\n; /* x */')).toEqual([]);
    expect(texts('')).toEqual([]);
  });

  test('an unterminated string runs to the end', () => {
    expect(texts("select 'abc; select 2")).toEqual(["select 'abc; select 2"]);
  });
});

describe('statementAt', () => {
  const sql = 'select 1;\nselect 2;\n\nselect 3';
  const at = (offset: number) => statementAt(sql, offset)?.text;

  test('finds the statement under the cursor', () => {
    expect(at(2)).toBe('select 1');
    expect(at(sql.indexOf('select 2') + 3)).toBe('select 2');
    expect(at(sql.length)).toBe('select 3');
  });

  test('a cursor right after the semicolon belongs to that statement', () => {
    expect(at(sql.indexOf(';') + 1)).toBe('select 1');
  });

  test('a cursor at the start of a statement belongs to it', () => {
    expect(at(sql.indexOf('select 2'))).toBe('select 2');
  });

  test('a cursor on an empty line takes the next statement', () => {
    expect(at(sql.indexOf('select 3') - 1)).toBe('select 3');
  });

  test('trailing spaces on the same line keep the previous statement', () => {
    expect(statementAt('select 1;   \nselect 2', 11)?.text).toBe('select 1');
  });

  test('a cursor after the last statement takes the last one', () => {
    expect(statementAt('select 1;\n\n', 11)?.text).toBe('select 1');
  });

  test('text without statements gives null', () => {
    expect(statementAt('-- only a comment', 3)).toBeNull();
    expect(statementAt('', 0)).toBeNull();
  });
});

describe('identifiers and previews', () => {
  test('quoteIdentifier doubles the closing quote per engine', () => {
    expect(quoteIdentifier('sqlite', 'we"ird')).toBe('"we""ird"');
    expect(quoteIdentifier('postgres', 'a')).toBe('"a"');
    expect(quoteIdentifier('mysql', 'a`b')).toBe('`a``b`');
    expect(quoteIdentifier('mssql', 'a]b')).toBe('[a]]b]');
  });

  test('previewQuery reads the first 500 rows', () => {
    expect(previewQuery('sqlite', 'main', 'users')).toBe('SELECT * FROM "main"."users" LIMIT 500;');
    expect(previewQuery('mssql', 'dbo', 'users')).toBe('SELECT TOP 500 * FROM [dbo].[users];');
  });
});

describe('resultSummary', () => {
  const base: SqlResult = { columns: [], rows: [], truncated: false, rowsAffected: null, elapsedMs: 12 };

  test('describes rows', () => {
    expect(resultSummary({ ...base, rows: [[1], [2]] })).toBe('2 rows in 12 ms');
    expect(resultSummary({ ...base, rows: [[1]] })).toBe('1 row in 12 ms');
  });

  test('marks truncated results', () => {
    expect(resultSummary({ ...base, rows: new Array(500).fill([1]), truncated: true })).toBe('500+ rows in 12 ms');
  });

  test('describes rows affected', () => {
    expect(resultSummary({ ...base, rowsAffected: 3 })).toBe('3 rows affected in 12 ms');
    expect(resultSummary({ ...base, rowsAffected: 1 })).toBe('1 row affected in 12 ms');
  });
});

describe('cell text and TSV', () => {
  test('cellText shows NULL, booleans and numbers readably', () => {
    expect(cellText(null)).toBe('NULL');
    expect(cellText(true)).toBe('true');
    expect(cellText(12.5)).toBe('12.5');
    expect(cellText('hi')).toBe('hi');
  });

  test('toTsv leaves NULL empty and separates with tabs and newlines', () => {
    expect(
      toTsv([
        [1, 'a', null],
        [2, 'b', true],
      ]),
    ).toBe('1\ta\t\n2\tb\ttrue');
  });

  test('toTsv quotes text that contains tabs, line breaks or quotes', () => {
    expect(toTsv([['a\tb', 'c\nd', 'say "hi"']])).toBe('"a\tb"\t"c\nd"\t"say ""hi"""');
  });
});
