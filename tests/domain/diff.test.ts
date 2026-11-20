import { describe, expect, test } from 'vitest';
import { hunkPatch, parseDiff } from '../../src/domain/diff';

const TWO_HUNKS = [
  'diff --git a/f.txt b/f.txt',
  'index 111..222 100644',
  '--- a/f.txt',
  '+++ b/f.txt',
  '@@ -1,3 +1,3 @@',
  ' line 1',
  '-line 2',
  '+line 2 CHANGED',
  ' line 3',
  '@@ -27,3 +27,4 @@ function tail()',
  ' line 27',
  '-line 28',
  '+line 28 CHANGED',
  '+extra line',
  ' line 29',
  '',
].join('\n');

describe('parseDiff', () => {
  test('finds the file and every hunk with its line numbers', () => {
    const [file] = parseDiff(TWO_HUNKS);
    expect(file.header).toContain('diff --git a/f.txt b/f.txt');
    expect(file.hunks).toHaveLength(2);
    expect(file.hunks[0]).toMatchObject({ oldStart: 1, oldLines: 3, newStart: 1, newLines: 3 });
    expect(file.hunks[1]).toMatchObject({ oldStart: 27, oldLines: 3, newStart: 27, newLines: 4 });
    expect(file.hunks[1].heading).toBe('function tail()');
  });

  test('counts added and removed lines per hunk', () => {
    const [file] = parseDiff(TWO_HUNKS);
    expect(file.hunks.map((h) => [h.added, h.removed])).toEqual([[1, 1], [2, 1]]);
  });

  test('keeps the lines of a hunk with their kind', () => {
    const [file] = parseDiff(TWO_HUNKS);
    expect(file.hunks[0].lines.map((l) => l.kind)).toEqual(['context', 'remove', 'add', 'context']);
    expect(file.hunks[0].lines[1].text).toBe('line 2');
  });

  test('a hunk header without counts means one line', () => {
    const [file] = parseDiff('diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -5 +5 @@\n-a\n+b\n');
    expect(file.hunks[0]).toMatchObject({ oldStart: 5, oldLines: 1, newStart: 5, newLines: 1 });
  });

  test('empty text and text without hunks give nothing to act on', () => {
    expect(parseDiff('')).toEqual([]);
    expect(parseDiff('diff --git a/b b/b\nBinary files a/b and b/b differ\n')[0].hunks).toEqual([]);
  });

  test('the no-newline marker stays with its hunk and is not a changed line', () => {
    const [file] = parseDiff('diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n');
    expect(file.hunks[0].added).toBe(1);
    expect(file.hunks[0].removed).toBe(1);
    expect(file.hunks[0].lines.some((l) => l.kind === 'meta')).toBe(true);
  });

  test('several files are kept apart', () => {
    const text = `${TWO_HUNKS}diff --git a/g.txt b/g.txt\n--- a/g.txt\n+++ b/g.txt\n@@ -1 +1 @@\n-x\n+y\n`;
    const files = parseDiff(text);
    expect(files).toHaveLength(2);
    expect(files[1].hunks).toHaveLength(1);
  });
});

describe('hunkPatch', () => {
  test('is the file header plus just the chosen hunk, ending with a newline', () => {
    const [file] = parseDiff(TWO_HUNKS);
    const patch = hunkPatch(file, 1)!;
    expect(patch.startsWith('diff --git a/f.txt b/f.txt\n')).toBe(true);
    expect(patch).toContain('@@ -27,3 +27,4 @@');
    expect(patch).not.toContain('line 2 CHANGED');
    expect(patch.endsWith('\n')).toBe(true);
  });

  test('the first hunk does not carry the second', () => {
    const [file] = parseDiff(TWO_HUNKS);
    const patch = hunkPatch(file, 0)!;
    expect(patch).toContain('line 2 CHANGED');
    expect(patch).not.toContain('line 28 CHANGED');
  });

  test('an unknown hunk gives null', () => {
    const [file] = parseDiff(TWO_HUNKS);
    expect(hunkPatch(file, 5)).toBeNull();
    expect(hunkPatch(file, -1)).toBeNull();
  });
});
