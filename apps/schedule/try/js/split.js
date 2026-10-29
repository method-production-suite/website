// Split screen (decisions.md, entry 80): a pane beside the Board tab's board, showing the
// selected strip's breakdown sheet, another board or sub-board, the calendar or the
// selected scene's images. The pane is the tab's own panel moved beside the board (its
// listeners and what is typed in it stay), and moved back when the Board tab isn't
// shown or the split is closed. One click on Single View closes it.
//
// The Breakdown tab can have the images beside it too (behavior note 22: breakdown beside
// images): the sheet shown's images and its elements', in the same pane. Which tab hosts
// the pane is the tab shown; each remembers its own choice.
//
// Which pane and how wide are a per-viewer convenience, remembered in this browser
// (localStorage, every access wrapped in try/catch), not schedule data. The width goes
// into a constructed stylesheet (dynstyle.js), numbers only; the bar between the panes
// drags, and Left and Right on it make the pane wider or narrower.

import { el, $ } from './dom.js';
import { setRules } from './dynstyle.js';
import { withShortcut } from './shortcuts.js';
import { paneFor, paneWidth, readSplit } from './logic.js';

const KEY = 'method-schedule.split';

/** The panes, in the picker's order: [kind, label, the panel it shows, its menu id]. */
export const PANES = [
  ['breakdown', 'Breakdown', 'panel-breakdown', 'view.split_breakdown'],
  ['board', 'Board', 'panel-board2', 'view.split_board'],
  ['calendar', 'Calendar', 'panel-calendar', 'view.split_calendar'],
  ['images', 'Images', 'panel-images', 'view.split_images'],
];
/** The tab a pane's panel belongs to when it isn't beside the board (none for the others). */
const TAB_OF = { breakdown: 'breakdown', calendar: 'calendar' };

const MIN_PX = 280;
const BOARD_MIN_PX = 320;
const DEFAULT_PX = 520;
const STEP_PX = 24;

const known = (k) => PANES.some((p) => p[0] === k);

function load() {
  try {
    return readSplit(window.localStorage.getItem(KEY), DEFAULT_PX);
  } catch {
    // Storage blocked: no split, the default width.
    return readSplit(null, DEFAULT_PX);
  }
}

function save(st) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ kind: st.kind, width: st.width, bdImages: st.bdImages }));
  } catch {
    // Not remembered; the split still works until the page reloads.
  }
}

/**
 * Sets up the split. `ctx.changed(kind)` runs after the pane beside the board changes
 * (kind null: none), so the page draws what the pane shows. Returns
 * { place(tab), setKind(kind), kind(), shown(), holds(node) }.
 */
export function createSplit(ctx) {
  const st = load();
  const split = $('split');
  const body = $('split-body');
  const bar = $('splitter');
  const work = split.parentNode;
  /** Where each panel goes back to among the tabs' panels: a placeholder per kind. */
  const homes = new Map();
  /** The kind beside the board now, or null. */
  let shown = null;
  let tabNow = 'board';

  const picker = el('select', { attrs: { id: 'split-kind', 'aria-label': 'What the pane beside the board shows' } }, ...PANES.map(([k, label]) => el('option', { text: label, attrs: { value: k } })));
  picker.addEventListener('change', () => setKind(picker.value));
  const single = el('button', { class: 'btn', text: 'Single View', attrs: { type: 'button', id: 'split-close' }, on: { click: () => close() } });
  single.title = withShortcut('Close the pane beside the board', 'view.single');
  const besideBoard = el('label', { class: 'field', attrs: { for: 'split-kind' } }, 'Beside the board', picker);
  const besideBreakdown = el('strong', { class: 'field', text: 'Images beside the breakdown' });
  $('split-head').replaceChildren(besideBoard, besideBreakdown, el('span', { class: 'bd-spacer' }), single);

  function clamp(w) {
    // The room left by what else stands in the row (the splitter, the Find panel).
    let room = work.getBoundingClientRect().width || 1200;
    for (const other of work.children) {
      if (other !== split && !other.classList.contains('panels') && !other.hidden) room -= other.getBoundingClientRect().width;
    }
    return paneWidth(w, room, MIN_PX, BOARD_MIN_PX);
  }

  function applyWidth() {
    const w = clamp(st.width);
    setRules('split-width', `#split { flex: 0 0 ${w}px; width: ${w}px; }`);
    bar.setAttribute('aria-valuenow', String(w));
    bar.setAttribute('aria-valuemin', String(MIN_PX));
  }

  /** Puts the pane for `tab` where it belongs. True when what is beside the board changed. */
  function place(tab) {
    const was = tabNow;
    tabNow = tab;
    const want = paneFor(tab, st.kind, st.bdImages);
    const onBoard = tab !== 'breakdown';
    besideBoard.hidden = !onBoard;
    besideBreakdown.hidden = onBoard;
    split.setAttribute('aria-label', onBoard ? 'Beside the board' : 'Beside the breakdown');
    single.title = withShortcut(onBoard ? 'Close the pane beside the board' : 'Close the images beside the breakdown', 'view.single');
    if (want === shown) return want !== null && was !== tab;
    if (shown) {
      const node = $(PANES.find((p) => p[0] === shown)[2]);
      const home = homes.get(shown);
      home.parentNode.insertBefore(node, home);
      node.hidden = TAB_OF[shown] !== tab;
    }
    shown = want;
    if (shown) {
      const node = $(PANES.find((p) => p[0] === shown)[2]);
      if (!homes.has(shown)) {
        const home = document.createComment(`${shown} pane`);
        node.parentNode.insertBefore(home, node);
        homes.set(shown, home);
      }
      body.replaceChildren(node);
      node.hidden = false;
      picker.value = shown;
      applyWidth();
    }
    split.hidden = !shown;
    bar.hidden = !shown;
    return true;
  }

  /** Shows `kind` beside the board (null closes the split, Single View). */
  function setKind(kind) {
    st.kind = known(kind) ? kind : null;
    save(st);
    place(tabNow);
    ctx.changed(st.kind);
  }

  /** Shows the images beside the Breakdown tab, or not. */
  function setBreakdownImages(on) {
    st.bdImages = Boolean(on);
    save(st);
    place(tabNow);
    ctx.changed(shown);
  }

  /** Single View: closes the pane of the tab shown. */
  function close() {
    if (tabNow === 'breakdown') setBreakdownImages(false);
    else setKind(null);
  }

  // Dragging the bar: the pane's width follows the pointer.
  let drag = null;
  bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { pointer: e.pointerId };
    try {
      bar.setPointerCapture(e.pointerId);
    } catch {
      // The drag still works while the pointer stays over the bar.
    }
    e.preventDefault();
  });
  bar.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    st.width = clamp(split.getBoundingClientRect().right - e.clientX);
    applyWidth();
  });
  const stop = () => {
    if (!drag) return;
    drag = null;
    save(st);
  };
  bar.addEventListener('pointerup', stop);
  bar.addEventListener('pointercancel', stop);
  bar.addEventListener('keydown', (e) => {
    const by = e.key === 'ArrowLeft' ? STEP_PX : e.key === 'ArrowRight' ? -STEP_PX : 0;
    if (!by) return;
    e.preventDefault();
    st.width = clamp(st.width + by);
    applyWidth();
    save(st);
  });
  window.addEventListener('resize', () => shown && applyWidth());
  // The Find panel opening or closing beside the pane changes the room too.
  const findpanel = $('findpanel');
  if (findpanel) new MutationObserver(() => shown && applyWidth()).observe(findpanel, { attributes: true, attributeFilter: ['hidden'] });

  return {
    place,
    setKind,
    setBreakdownImages,
    close,
    /** The pane chosen (shown whenever the Board tab is). */
    kind: () => st.kind,
    /** The pane beside the board now, or null. */
    shown: () => shown,
    /** True when `node` is in the pane beside the board. */
    holds: (node) => Boolean(shown && node && split.contains(node)),
  };
}
