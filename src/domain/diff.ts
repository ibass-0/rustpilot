export type DiffLineKind = 'context' | 'add' | 'remove' | 'meta';

export interface DiffLine {
  kind: DiffLineKind;
  /** The line without its leading `+`, `-` or space. */
  text: string;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** The text after the second `@@`, usually the enclosing function. */
  heading: string;
  /** The `@@ … @@` line as Git wrote it. */
  header: string;
  lines: DiffLine[];
  added: number;
  removed: number;
}

export interface DiffFile {
  /** Everything before the first hunk: `diff --git`, `index`, `---`, `+++`. */
  header: string;
  hunks: DiffHunk[];
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;

/** Split the output of `git diff` into files and hunks. */
export function parseDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | null = null;
  let hunk: DiffHunk | null = null;
  const header: string[] = [];

  const flushHeader = () => {
    if (file) file.header = `${header.join('\n')}\n`;
    header.length = 0;
  };

  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      if (file) flushHeader();
      file = { header: '', hunks: [] };
      files.push(file);
      hunk = null;
      header.push(line);
      continue;
    }
    if (!file) continue;
    const match = HUNK_HEADER.exec(line);
    if (match) {
      if (file.hunks.length === 0) flushHeader();
      hunk = {
        oldStart: Number(match[1]),
        oldLines: match[2] === undefined ? 1 : Number(match[2]),
        newStart: Number(match[3]),
        newLines: match[4] === undefined ? 1 : Number(match[4]),
        heading: match[5],
        header: line,
        lines: [],
        added: 0,
        removed: 0,
      };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) {
      header.push(line);
      continue;
    }
    if (line.startsWith('+')) {
      hunk.lines.push({ kind: 'add', text: line.slice(1) });
      hunk.added++;
    } else if (line.startsWith('-')) {
      hunk.lines.push({ kind: 'remove', text: line.slice(1) });
      hunk.removed++;
    } else if (line.startsWith('\\')) {
      hunk.lines.push({ kind: 'meta', text: line });
    } else if (line.startsWith(' ')) {
      hunk.lines.push({ kind: 'context', text: line.slice(1) });
    }
  }
  if (file && file.hunks.length === 0) flushHeader();
  return files;
}

const prefixOf = (kind: DiffLineKind): string => (kind === 'add' ? '+' : kind === 'remove' ? '-' : kind === 'meta' ? '' : ' ');

/** A patch with the file header and only hunk `index`, which `git apply` can take; `null` for an unknown hunk. */
export function hunkPatch(file: DiffFile, index: number): string | null {
  const hunk = file.hunks[index];
  if (!hunk) return null;
  const body = hunk.lines.map((line) => `${prefixOf(line.kind)}${line.text}`).join('\n');
  return `${file.header}${hunk.header}\n${body}\n`;
}
