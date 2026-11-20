import { createMemo, createSignal, For, onCleanup, onMount, type JSX } from 'solid-js';
import { cellText, toTsv, type CellValue, type SqlResult } from '../../domain/sql';
import '../styles/database.css';

const ROW_HEIGHT = 22;
const OVERSCAN = 10;
const INDEX_WIDTH = 52;
const MIN_COLUMN = 60;

interface Cell {
  row: number;
  col: number;
}

/** A starting width for each column from its header and the first rows. */
function initialWidths(result: SqlResult): number[] {
  return result.columns.map((column, c) => {
    let longest = column.name.length + 2;
    for (let r = 0; r < Math.min(result.rows.length, 50); r++) {
      longest = Math.max(longest, cellText(result.rows[r][c]).length);
    }
    return Math.min(320, Math.max(80, longest * 8 + 18));
  });
}

/**
 * A read-only grid. Only the rows in view are in the DOM, so 500 rows (or many
 * more) scroll smoothly. Click selects a cell, Shift+click extends the
 * selection, Ctrl+C copies it as tab-separated text.
 */
export function ResultGrid(props: { result: SqlResult }): JSX.Element {
  let scroller!: HTMLDivElement;
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewport, setViewport] = createSignal(300);
  const [widths, setWidths] = createSignal<number[]>(initialWidths(props.result));
  const [anchor, setAnchor] = createSignal<Cell | null>(null);
  const [focus, setFocus] = createSignal<Cell | null>(null);

  onMount(() => {
    setViewport(scroller.clientHeight);
    const observer = new ResizeObserver(() => setViewport(scroller.clientHeight));
    observer.observe(scroller);
    onCleanup(() => observer.disconnect());
  });

  const totalWidth = () => INDEX_WIDTH + widths().reduce((sum, w) => sum + w, 0);
  const visible = createMemo(() => {
    const count = props.result.rows.length;
    const first = Math.max(0, Math.floor(scrollTop() / ROW_HEIGHT) - OVERSCAN);
    const last = Math.min(count, Math.ceil((scrollTop() + viewport()) / ROW_HEIGHT) + OVERSCAN);
    return Array.from({ length: Math.max(0, last - first) }, (_, i) => first + i);
  });

  const selected = (row: number, col: number): boolean => {
    const a = anchor();
    const f = focus();
    if (!a || !f) return false;
    return (
      row >= Math.min(a.row, f.row) &&
      row <= Math.max(a.row, f.row) &&
      col >= Math.min(a.col, f.col) &&
      col <= Math.max(a.col, f.col)
    );
  };

  const pick = (event: MouseEvent, row: number, col: number) => {
    if (event.shiftKey && anchor()) {
      setFocus({ row, col });
    } else {
      setAnchor({ row, col });
      setFocus({ row, col });
    }
    scroller.focus();
  };

  const copy = (event: KeyboardEvent) => {
    const a = anchor();
    const f = focus();
    if (!(event.ctrlKey && event.key.toLowerCase() === 'c') || !a || !f) return;
    event.preventDefault();
    const rows = props.result.rows
      .slice(Math.min(a.row, f.row), Math.max(a.row, f.row) + 1)
      .map((row) => row.slice(Math.min(a.col, f.col), Math.max(a.col, f.col) + 1));
    void navigator.clipboard.writeText(toTsv(rows));
  };

  const startResize = (event: PointerEvent, col: number) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = widths()[col];
    const move = (e: PointerEvent) => {
      const next = Math.max(MIN_COLUMN, startWidth + e.clientX - startX);
      setWidths((all) => all.map((w, i) => (i === col ? next : w)));
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  const cellProps = (value: CellValue) => ({
    'data-number': typeof value === 'number' ? '' : undefined,
    'data-null': value === null ? '' : undefined,
  });

  return (
    <div
      class="grid"
      ref={scroller}
      tabindex="0"
      role="grid"
      aria-rowcount={props.result.rows.length}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      onKeyDown={copy}
    >
      <div class="grid-head" role="row" style={{ width: `${totalWidth()}px` }}>
        <div class="grid-cell grid-index" style={{ width: `${INDEX_WIDTH}px` }} />
        <For each={props.result.columns}>
          {(column, c) => (
            <div class="grid-cell" role="columnheader" style={{ width: `${widths()[c()]}px` }} title={`${column.name} ${column.typeName}`}>
              {column.name}
              <span class="grid-type">{column.typeName.toLowerCase()}</span>
              <div class="grid-resize" onPointerDown={(event) => startResize(event, c())} />
            </div>
          )}
        </For>
      </div>
      <div class="grid-inner" style={{ height: `${props.result.rows.length * ROW_HEIGHT}px`, width: `${totalWidth()}px` }}>
        <For each={visible()}>
          {(r) => (
            <div class="grid-row" role="row" style={{ top: `${r * ROW_HEIGHT}px` }}>
              <div class="grid-cell grid-index" style={{ width: `${INDEX_WIDTH}px` }}>
                {r + 1}
              </div>
              <For each={props.result.rows[r]}>
                {(value, c) => (
                  <div
                    class="grid-cell"
                    role="gridcell"
                    style={{ width: `${widths()[c()]}px` }}
                    data-selected={selected(r, c()) ? '' : undefined}
                    {...cellProps(value)}
                    title={typeof value === 'string' && value.length > 40 ? value.slice(0, 500) : undefined}
                    onPointerDown={(event) => pick(event, r, c())}
                  >
                    {cellText(value)}
                  </div>
                )}
              </For>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
