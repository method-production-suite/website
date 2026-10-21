// The board beside the board (split screen, decisions.md, entry 80): any board of the
// schedule, or one sub-board of it, drawn by the same code as the Board tab (board.js,
// its own ids and colors). Click selects here, double-click opens a scene's sheet,
// dragging moves strips on the board shown here as one undo step, and the start date and
// day break fields work as on the Board tab. Rust sends the board (board_view); the
// board shown on the Board tab stays as it is. While the Find panel is open its results
// are outlined here too (decisions.md, entry 184).

import { el, $ } from './dom.js';
import { createBoard } from './board.js';

/**
 * `ctx`: { view() (the page's view), load(board) (board_view), apply(pending) (shows a
 * command's view), move(board, strips, sub, index), setStart(sub, date),
 * autoBreaks(sub, by, limit), removeBreaks(sub), openSheet(sheet), found(board) (the
 * Find panel's marks for that board, or null) }. Returns { refresh(), board(),
 * markFound() }.
 */
export function createBoard2(ctx) {
  const host = $('board2');
  const head = $('board2-head');
  let boardId = null;
  /** 'all', or a sub-board id: the only sub-board drawn. */
  let only = 'all';
  let data = null;
  let rows = [];
  let selected = null;
  let picked = new Set();
  let anchor = null;

  const boardPick = el('select', { attrs: { id: 'b2-board', 'aria-label': 'Board beside the board' } });
  const subPick = el('select', { attrs: { id: 'b2-sub', 'aria-label': 'Sub-board beside the board' } });
  const note = el('span', { class: 'bd-hint' });
  head.replaceChildren(el('label', { class: 'field', attrs: { for: 'b2-board' } }, 'Board', boardPick), el('label', { class: 'field', attrs: { for: 'b2-sub' } }, 'Show', subPick), note);
  boardPick.addEventListener('change', () => {
    boardId = Number(boardPick.value);
    only = 'all';
    refresh();
  });
  subPick.addEventListener('change', () => {
    only = subPick.value === 'all' ? 'all' : Number(subPick.value);
    draw();
  });

  const board = createBoard(
    host,
    $('split-body'),
    {
      onPick: (id, how) => pick(id, how),
      onOpen: (row) => row && row.kind === 'scene' && row.sheet !== null && ctx.openSheet(row.sheet),
      onStart: (sub, date) => ctx.setStart(sub, date),
      onAutoBreaks: (sub, by, limit) => ctx.autoBreaks(sub, by, limit),
      onRemoveBreaks: (sub) => ctx.removeBreaks(sub),
      dragSet: (id) => {
        if (!picked.has(id)) pick(id, {});
        return rows.filter((r) => picked.has(r.id));
      },
      onDrop: (moving, to) => {
        if (to.refused) return;
        ctx.move(boardId, moving.map((r) => r.id), to.sub_board, to.index);
      },
    },
    { prefix: 'b2-' },
  );

  function pick(id, how = {}) {
    if (how.range && anchor !== null) {
      const a = rows.findIndex((r) => r.id === anchor);
      const b = rows.findIndex((r) => r.id === id);
      if (a >= 0 && b >= 0) picked = new Set(rows.slice(Math.min(a, b), Math.max(a, b) + 1).map((r) => r.id));
    } else if (how.toggle) {
      if (picked.has(id)) picked.delete(id);
      else picked.add(id);
      anchor = id;
    } else {
      picked = new Set([id]);
      anchor = id;
    }
    selected = id;
    board.select(id, picked);
    host.focus({ preventScroll: true });
  }

  /** The board beside: the one chosen while it exists, else the next board after the one shown, else the same. */
  function chooseBoard(view) {
    const ids = view.boards.map((b) => b.id);
    if (boardId !== null && ids.includes(boardId)) return;
    const at = ids.indexOf(view.board.id);
    boardId = ids.length > 1 ? ids[(at + 1) % ids.length] : view.board.id;
    // The same board twice: show its second sub-board when it has one.
    only = boardId === view.board.id && view.board.sub_boards.length > 1 ? view.board.sub_boards[1].id : 'all';
  }

  function draw() {
    if (!data) return;
    const subs = data.sub_boards;
    if (only !== 'all' && !subs.some((sb) => sb.id === only)) only = 'all';
    subPick.replaceChildren(el('option', { text: 'Every sub-board', attrs: { value: 'all' } }), ...subs.map((sb) => el('option', { text: sb.name, attrs: { value: String(sb.id) } })));
    subPick.value = String(only);
    const shown = only === 'all' ? data : { ...data, sub_boards: subs.filter((sb) => sb.id === only) };
    board.setFound(ctx.found(boardId));
    rows = board.render(shown, selected, picked, []);
    const ids = new Set(rows.map((r) => r.id));
    picked = new Set([...picked].filter((x) => ids.has(x)));
    if (!ids.has(selected)) selected = null;
    board.select(selected, picked);
    const view = ctx.view();
    note.textContent = view && boardId === view.board.id ? 'The board shown on the Board tab' : '';
  }

  async function refresh() {
    const view = ctx.view();
    if (!view) return;
    chooseBoard(view);
    boardPick.replaceChildren(...view.boards.map((b) => el('option', { text: b.name, attrs: { value: String(b.id) } })));
    boardPick.value = String(boardId);
    data = await ctx.load(boardId);
    draw();
  }

  /** The Find panel's results changed: outline them on the board shown here. */
  function markFound() {
    if (data) board.setFound(ctx.found(boardId));
  }

  return { refresh, board: () => boardId, markFound };
}
