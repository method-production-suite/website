// The Calendar tab: one month of the picked sub-board's calendar (calendar_view,
// src/view.rs) with shoot day numbers, days off, holidays, company travel days and
// events; marking the picked date, the weekly days off, and adding, editing and deleting
// events. Rust checks and makes every change (src/calendar.rs), each one undo step, and
// the board and the day out of days follow the reflowed dates.
//
// In the month, the arrow keys move the picked date (a day, or a week up and down) and
// Page Up and Page Down go a month back or on.
//
// Decision 59: each shoot day lists its scene strips (the fields the user picks with
// Strip Fields…), its pages and estimated length. Drag a strip onto another shoot day to
// move it there (the end of that day, through move_strips, one undo step). The filter
// (check boxes for several categories and several elements, behavior note 27) shows only
// the strips holding a checked element, for this session. Today
// and Go To move around; the week start and the date format are the user's preferences
// (settings.json, not the schedule), set in Settings (its button here opens it). Print and Save as PDF print the Calendar report.
// Prep start and wrap end are kept for the budget exchange.
//
// Decision 111: Month or Weeks (every week of the schedule in one list, this browser's
// pick), an Actions menu for the picked date (also on a right-click), and the switches of
// what each date shows, kept in the schedule. Holidays carry a star, company travel a plane.

import { el } from './dom.js';
import { dateInput, typedDate, showDate, dayDate } from './dates.js';
import { confirmDialog, customDialog, errorLine } from './modal.js';
import { SHEET_FIELDS } from './strips.js';
import { openMenu } from './ctxmenu.js';
import { setRules } from './dynstyle.js';
import { calendarDrop, calendarFilter, dragStarted, dropEscape, goToDate, stripShown } from './logic.js';

/**
 * A compact drop-down of check boxes: a button showing what is checked and a small list
 * under it, closed by a click outside or Escape. Returns { node, btn, list }.
 */
function checkDrop(id, label) {
  const btn = el('button', { class: 'btn cal-drop-btn', attrs: { type: 'button', id, 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-label': label, title: label } });
  const list = el('div', { class: 'cal-drop-list', attrs: { role: 'group', 'aria-label': label } });
  list.hidden = true;
  const node = el('div', { class: 'cal-drop' }, btn, list);
  const onDown = (e) => {
    if (!node.contains(e.target)) close();
  };
  // Escape closes the open list wherever focus is (decisions.md, entry 168): WebKit
  // leaves focus on the page's body after a click on a check box, outside the list, so
  // the document listens while it is open, first (capture), and the Escape stops there:
  // a dialog around the calendar or anything else that takes Escape keeps it.
  const onKey = (e) => {
    if (!dropEscape(e, !list.hidden)) return;
    e.preventDefault();
    e.stopPropagation();
    close();
    btn.focus();
  };
  function close() {
    list.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
  }
  btn.addEventListener('click', () => {
    if (!list.hidden) return close();
    list.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    const first = list.querySelector('input');
    if (first) first.focus();
  });
  return { node, btn, list };
}

const WEEKDAYS = [
  ['mon', 'Mon'],
  ['tue', 'Tue'],
  ['wed', 'Wed'],
  ['thu', 'Thu'],
  ['fri', 'Fri'],
  ['sat', 'Sat'],
  ['sun', 'Sun'],
];
const DAY_KINDS = [
  ['work', 'Working'],
  ['off', 'Day off'],
  ['holiday', 'Holiday'],
  ['move', 'Company travel'],
];
// The kinds and colors the editor offers come with the view (calendar_view: event_kinds,
// event_colors; decision 109): the counting kinds, unavailable, camera test, the
// post-production kinds and other; ten colors of our own.
let EVENT_KINDS = [
  ['travel', 'Travel'],
  ['fitting', 'Fitting'],
  ['rehearsal', 'Rehearsal'],
  ['unavailable', 'Unavailable'],
  ['camera_test', 'Camera test'],
  ['other', 'Other'],
];
let EVENT_COLORS = [];
/** The class that paints an event in its color (styles.css, `ev-c-*`), or ''. */
const colorClass = (ev) => (ev.color && EVENT_COLORS.some(([k]) => k === ev.color) ? ` ev-c-${ev.color}` : '');
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function kindText(ev) {
  if (ev.kind === 'other') return ev.label || 'Other';
  const k = EVENT_KINDS.find(([key]) => key === ev.kind);
  return k ? k[1] : ev.kind;
}

function eventText(ev) {
  return ev.name ? `${kindText(ev)}: ${ev.name}` : kindText(ev);
}

/** `YYYY-MM-DD` moved by `n` days. */
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** A date with its weekday, in the date format chosen in Settings (`Mon 2027-03-01`). */
function longDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(d.getTime()) ? dayDate(DAY_NAMES[d.getUTCDay()], iso) : iso;
}

/** Strip Fields…: what a strip shows on a calendar date, in order. Resolves with the fields, or null. */
function fieldsDialog(current) {
  return customDialog((close) => {
    const rows = [...current.map((f) => ({ f, on: true })), ...SHEET_FIELDS.map((x) => x[0]).filter((f) => !current.includes(f)).map((f) => ({ f, on: false }))];
    const list = el('ul', { class: 'lay-list' });
    const nameOf = (f) => (SHEET_FIELDS.find((x) => x[0] === f) || [f, f])[1];
    const draw = () => {
      list.replaceChildren(
        ...rows.map((r, i) => {
          const box = el('input', { attrs: { id: `cal-f-${r.f}`, type: 'checkbox', checked: r.on } });
          box.addEventListener('change', () => (r.on = box.checked));
          const move = (by) => {
            const j = i + by;
            if (j < 0 || j >= rows.length) return;
            [rows[i], rows[j]] = [rows[j], rows[i]];
            draw();
          };
          return el(
            'li',
            { class: 'lay-row' },
            el('label', { class: 'el-check', attrs: { for: `cal-f-${r.f}` } }, box, el('span', { text: nameOf(r.f) })),
            el('button', { class: 'btn', text: 'Up', attrs: { type: 'button', 'aria-label': `Move ${nameOf(r.f)} up` }, on: { click: () => move(-1) } }),
            el('button', { class: 'btn', text: 'Down', attrs: { type: 'button', 'aria-label': `Move ${nameOf(r.f)} down` }, on: { click: () => move(1) } }),
          );
        }),
      );
    };
    draw();
    const problem = errorLine('bd-error', { text: 'Show at least one field.' });
    return el(
      'div',
      { class: 'modal', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' } },
      el('h2', { class: 'modal-title', text: 'Calendar strips', attrs: { id: 'modal-title' } }),
      el('p', { class: 'modal-message', text: 'What a strip shows on a calendar date, in order. Kept in the schedule, as strip layouts are.' }),
      problem,
      list,
      el(
        'div',
        { class: 'modal-actions' },
        el('button', { class: 'btn', text: 'Cancel', attrs: { type: 'button' }, on: { click: () => close(null) } }),
        el(
          'button',
          {
            class: 'btn btn-primary',
            text: 'Use These',
            attrs: { type: 'button', 'data-autofocus': true },
            on: {
              click: () => {
                const out = rows.filter((r) => r.on).map((r) => r.f);
                if (!out.length) problem.hidden = false;
                else close(out);
              },
            },
          },
        ),
      ),
    );
  });
}

/**
 * Builds the tab in `host`. `actions` (each returns a promise; edits reject with a plain
 * message): month(year, month) shows another month, setDayKind(date, kind),
 * setWeeklyOff(days), saveEvent(index, event), deleteEvent(index), moveStrip(board,
 * strip, index), setPrepWrap(prep, wrap), setFields(fields) (the strip fields, kept
 * in the schedule), prefs() (the user's preferences), setPrefs(changes), settings()
 * (opens Settings), print(pdf), setHidden(keys) (what each date hides, kept in the
 * schedule), setSpan(on) (the weeks view, this browser), addRedFlag(date) and
 * setStart(date) (the Actions menu). Returns { render(dto), goTo(date, focus),
 * newEvent(elements, date) }: the last opens the event editor for a new event with those
 * elements picked (New Event from the Elements and Breakdown tabs).
 */
export function createCalendar(host, actions) {
  let dto = null;
  let picked = null;
  /** The filter, this session only: the checked category names and element ids (none: All). */
  let filter = { categories: [], elements: [] };

  const error = errorLine();
  function showError(text) {
    error.textContent = text ? String(text) : '';
    error.hidden = !text;
  }
  async function attempt(run) {
    try {
      await run();
      showError('');
      return true;
    } catch (e) {
      showError(e);
      return false;
    }
  }

  // ---- The head: month, moving between months, the weekly days off.
  const title = el('h2', {});
  const monthTitle = el('strong', { class: 'cal-title', attrs: { 'aria-live': 'polite' } });
  const prev = el('button', { class: 'btn', text: 'Previous Month', attrs: { type: 'button' } });
  const next = el('button', { class: 'btn', text: 'Next Month', attrs: { type: 'button' } });
  const firstDay = el('button', { class: 'btn', text: 'First Shoot Day', attrs: { type: 'button' } });
  const todayBtn = el('button', { class: 'btn', text: 'Today', attrs: { type: 'button', id: 'cal-today' } });
  const goField = dateInput({ class: 'w-s', id: 'cal-goto', 'aria-label': 'Go to date', placeholder: 'Go to date' });
  // Month or the continuous weeks view (decision 111): remembered in this browser.
  const monthView = el('button', { class: 'btn', text: 'Month', attrs: { type: 'button', id: 'cal-month-view', 'aria-pressed': 'true', title: 'One month at a time' } });
  const weeksView = el('button', { class: 'btn', text: 'Weeks', attrs: { type: 'button', id: 'cal-weeks-view', 'aria-pressed': 'false', title: 'Every week of the schedule, from its first date to its last, in one list' } });
  monthView.addEventListener('click', () => dto && dto.span && actions.setSpan(false));
  weeksView.addEventListener('click', () => dto && !dto.span && actions.setSpan(true));
  /** The month buttons, hidden in the weeks view (render's argument shadows `next`). */
  const monthButtons = [prev, next];
  prev.addEventListener('click', () => dto && actions.month(dto.prev[0], dto.prev[1]));
  next.addEventListener('click', () => dto && actions.month(dto.next[0], dto.next[1]));
  firstDay.addEventListener('click', () => dto && dto.first_day && goTo(dto.first_day));
  todayBtn.addEventListener('click', () => dto && goTo(dto.today));
  goField.addEventListener('change', () => {
    const go = goToDate(goField.value);
    if (go.date) goTo(go.date);
    else if (go.error) showError(go.error);
  });
  const note = el('p', { class: 'bd-hint' });

  // ---- The user's preferences, the filter, printing.
  // The week start and the date format are set in Settings, for every tab at once.
  const settingsBtn = el('button', { class: 'btn', text: 'Week and Dates…', attrs: { type: 'button', id: 'cal-settings', title: 'The week start and how dates show, in Settings' }, on: { click: () => actions.settings() } });
  const fieldsBtn = el('button', { class: 'btn', text: 'Strip Fields…', attrs: { type: 'button', id: 'cal-fields' } });
  fieldsBtn.addEventListener('click', async () => {
    const out = await fieldsDialog(dto && Array.isArray(dto.fields) ? dto.fields : []);
    if (out) attempt(() => actions.setFields(out));
  });
  const catFilter = checkDrop('cal-filter-cat', 'Filter by category');
  const elFilter = checkDrop('cal-filter-el', 'Filter by element');
  const printBtn = el('button', { class: 'btn', text: 'Print…', attrs: { type: 'button', id: 'cal-print', title: 'Print the Calendar report' }, on: { click: () => actions.print(false) } });
  const pdfBtn = el('button', { class: 'btn', text: 'Save as PDF…', attrs: { type: 'button', id: 'cal-pdf', title: 'Save the Calendar report as a PDF' }, on: { click: () => actions.print(true) } });
  const prep = dateInput({ class: 'w-s', id: 'cal-prep', 'aria-label': 'Prep starts' });
  const wrap = dateInput({ class: 'w-s', id: 'cal-wrap', 'aria-label': 'Wrap ends' });
  for (const f of [prep, wrap]) f.addEventListener('change', () => attempt(() => actions.setPrepWrap(prep.value, wrap.value)));

  const week = WEEKDAYS.map(([key, label]) => {
    const input = el('input', { attrs: { id: `cal-off-${key}`, type: 'checkbox' } });
    input.addEventListener('change', () => {
      const days = week.filter((w) => w.input.checked).map((w) => w.key);
      attempt(() => actions.setWeeklyOff(days)).then((ok) => {
        if (!ok) input.checked = !input.checked;
      });
    });
    return { key, input, node: el('label', { class: 'el-check', attrs: { for: `cal-off-${key}` } }, input, el('span', { text: label })) };
  });

  const head = el(
    'div',
    { class: 'cal-head' },
    title,
    el('div', { class: 'cal-nav', attrs: { role: 'group', 'aria-label': 'View' } }, monthView, weeksView),
    el('div', { class: 'cal-nav' }, prev, monthTitle, next, firstDay, todayBtn, goField),
    el('div', { class: 'cal-nav' }, printBtn, pdfBtn),
  );
  const viewRow = el(
    'div',
    { class: 'el-row cal-view', attrs: { role: 'group', 'aria-label': 'View' } },
    el('label', { class: 'el-label', attrs: { for: 'cal-filter-cat' }, text: 'Show' }),
    catFilter.node,
    elFilter.node,
    fieldsBtn,
    settingsBtn,
    el('label', { class: 'el-label', attrs: { for: 'cal-prep' }, text: 'Prep starts', title: 'For the budget exchange file' }),
    prep,
    el('label', { class: 'el-label', attrs: { for: 'cal-wrap' }, text: 'Wrap ends', title: 'For the budget exchange file' }),
    wrap,
  );
  const weekRow = el('div', { class: 'el-row cal-week', attrs: { role: 'group', 'aria-label': 'Days off each week' } }, el('span', { class: 'el-label', text: 'Days off each week' }), ...week.map((w) => w.node));

  // ---- The View switches (decision 111): what each date shows, kept in the schedule.
  const showRow = el('div', { class: 'el-row cal-week cal-shows', attrs: { role: 'group', 'aria-label': 'What each date shows' } });
  const hidden = () => new Set(dto && Array.isArray(dto.hidden) ? dto.hidden : []);
  const sendHidden = (keys) => attempt(() => actions.setHidden(keys));
  function drawShows() {
    const off = hidden();
    const shows = dto && Array.isArray(dto.shows) ? dto.shows : [];
    showRow.replaceChildren(
      el('span', { class: 'el-label', text: 'On each date' }),
      ...shows.map(([key, label]) => {
        const input = el('input', { attrs: { id: `cal-show-${key}`, type: 'checkbox', checked: !off.has(key) } });
        input.addEventListener('change', () => {
          const next = hidden();
          if (input.checked) next.delete(key);
          else next.add(key);
          sendHidden(shows.map(([k]) => k).filter((k) => next.has(k)));
        });
        return el('label', { class: 'el-check', attrs: { for: `cal-show-${key}` } }, input, el('span', { text: label }));
      }),
      el('button', { class: 'btn btn-mini', text: 'All', attrs: { type: 'button', id: 'cal-show-all', title: 'Show everything on each date' }, on: { click: () => sendHidden([]) } }),
      el('button', { class: 'btn btn-mini', text: 'None', attrs: { type: 'button', id: 'cal-show-none', title: 'Show only the date numbers' }, on: { click: () => sendHidden(shows.map(([k]) => k)) } }),
    );
  }

  // ---- The month.
  const grid = el('table', { class: 'cal-month', attrs: { role: 'grid', 'aria-label': 'Month' } });
  grid.addEventListener('keydown', (e) => {
    if (!picked) return;
    const by = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (by) {
      e.preventDefault();
      goTo(addDays(picked, by), true);
    } else if ((e.key === 'PageUp' || e.key === 'PageDown') && dto.span) {
      // The weeks view: four weeks back or on.
      e.preventDefault();
      goTo(addDays(picked, e.key === 'PageUp' ? -28 : 28), true);
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      const [y, m] = e.key === 'PageUp' ? dto.prev : dto.next;
      picked = null;
      actions.month(y, m);
    }
  });

  /** The Actions menu for `date` (behavior note 22): what it is, an event, a red flag, the start. */
  function actionsMenu(date, x, y, back) {
    const d = day(date);
    if (!d) return;
    const mark = (kind, label) => ({ label: d.kind === kind ? `${label} (now)` : label, disabled: d.kind === kind, run: () => attempt(() => actions.setDayKind(date, kind)) });
    openMenu(
      x,
      y,
      [
        mark('work', 'Working Day'),
        mark('off', 'Day Off'),
        mark('move', 'Company Travel Day'),
        mark('holiday', 'Holiday'),
        'sep',
        { label: 'Add Event…', run: () => editEvent(null, date) },
        { label: 'Add Red Flag…', run: () => actions.addRedFlag(date) },
        'sep',
        { label: dto.start === date ? 'Start Date (now)' : 'Set as Start Date', disabled: dto.start === date, run: () => attempt(() => actions.setStart(date)) },
      ],
      { label: `Actions for ${longDate(date)}`, back },
    );
  }
  grid.addEventListener('contextmenu', (e) => {
    const b = e.target.closest && e.target.closest('td') && e.target.closest('td').querySelector('.cal-day');
    if (!b) return;
    e.preventDefault();
    pick(b.dataset.date);
    actionsMenu(b.dataset.date, e.clientX, e.clientY, b);
  });

  function dayLabel(d) {
    if (hidden().has('day_labels')) return '';
    if (d.shoot_day) return `Day ${d.shoot_day}`;
    if (d.kind === 'off') return 'Off';
    if (d.kind === 'holiday') return 'Holiday';
    if (d.kind === 'move') return 'Travel day';
    return d.weekly_off ? 'Working' : '';
  }

  /**
   * The filter's two lists (behavior note 27): the categories in use and the elements of
   * the checked ones (every one under All), each with All, several checked at once.
   */
  function drawFilter() {
    const fit = calendarFilter(dto.elements, filter);
    filter = fit.filter;
    // A check redraws both lists; the box just clicked keeps the focus.
    const change = (next) => {
      const at = document.activeElement && document.activeElement.id;
      filter = next;
      drawFilter();
      drawMonth();
      const again = at && document.getElementById(at);
      if (again) again.focus();
    };
    const box = (id, text, on, toggle) => {
      const input = el('input', { attrs: { id, type: 'checkbox', checked: on } });
      input.addEventListener('change', toggle);
      return el('label', { class: 'el-check', attrs: { for: id } }, input, el('span', { text }));
    };
    const flip = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
    catFilter.btn.textContent = filter.categories.length ? filter.categories.join(', ') : 'All categories';
    catFilter.list.replaceChildren(
      box('cal-fc-all', 'All', !filter.categories.length, () => change({ categories: [], elements: filter.elements })),
      ...fit.categories.map((c, i) => box(`cal-fc-${i}`, c, filter.categories.includes(c), () => change({ categories: flip(filter.categories, c), elements: filter.elements }))),
    );
    const names = new Map(dto.elements.map((e) => [e.id, e.board_id ? `${e.board_id} ${e.name}` : e.name]));
    elFilter.btn.textContent = !filter.elements.length ? (filter.categories.length ? 'Any of them' : 'All elements') : filter.elements.length === 1 ? names.get(filter.elements[0]) : `${filter.elements.length} elements`;
    elFilter.list.replaceChildren(
      box('cal-fe-all', 'All', !filter.elements.length, () => change({ categories: filter.categories, elements: [] })),
      ...fit.groups.flatMap((g) => [
        el('span', { class: 'cal-drop-head', text: g.category }),
        ...g.elements.map((e) => box(`cal-fe-${e.id}`, names.get(e.id), filter.elements.includes(e.id), () => change({ categories: filter.categories, elements: flip(filter.elements, e.id) }))),
      ]),
    );
  }

  /** Whether the filter shows a strip. */
  function shows(st) {
    return stripShown(st, filter, dto.elements);
  }

  /** A day's strips: each draggable onto another shoot day. */
  function stripList(d) {
    const off = hidden();
    const strips = off.has('strips') ? [] : (d.strips || []).filter(shows);
    const banners = off.has('banners') ? [] : d.banners || [];
    if (!strips.length && !banners.length && !d.shoot_day) return null;
    const scenes = Number(d.scenes) || 0;
    const len = d.shoot_day
      ? [off.has('scenes') ? null : `${scenes} sc`, off.has('pages') ? null : `${d.pages || '0'} pg`, off.has('time') ? null : d.time || '0:00'].filter(Boolean).join(', ')
      : '';
    return el(
      'div',
      { class: 'cal-strips', data: { date: d.date } },
      ...banners.map((t) => el('div', { class: 'cal-banner', text: t, title: `Banner: ${t}` })),
      ...strips.map((st) =>
        el('div', {
          class: `cal-strip tone-${st.tone}`,
          text: st.cells.filter(Boolean).join(' · '),
          title: `${st.cells.filter(Boolean).join(', ')}. Drag to another shoot day to move it.`,
          data: { strip: st.strip },
        }),
      ),
      len ? el('div', { class: 'cal-len', text: len, title: `${scenes === 1 ? '1 scene' : `${scenes} scenes`}, ${d.pages || '0'} pages, ${d.time || '0:00'} estimated` }) : null,
    );
  }

  // Dragging (CAL-06, decisions.md, entry 160): a strip onto another shoot day goes to the
  // end of that day's strips; an event moves to start on the date it is let go on, keeping
  // its length. Each is one undo step. Pointer events, as the board's: the Tauri window
  // takes HTML drag and drop for itself on macOS, so draggable elements never dropped.
  let drag = null;
  let swallowClick = false;
  const cellAt = (x, y) => {
    const hit = document.elementFromPoint(x, y);
    const td = hit && hit.closest && hit.closest('td');
    if (!td || !grid.contains(td)) return null;
    const b = td.querySelector('[data-date]');
    return b ? { td, drop: td.dataset.drop ?? null, date: b.dataset.date } : null;
  };
  const showAim = (cell) => {
    const cls = drag && drag.kind === 'strip' ? 'drop-here' : 'drop-date';
    const on = cell && calendarDrop(drag, cell) ? cell.td : null;
    for (const c of grid.querySelectorAll('.drop-here, .drop-date')) if (c !== on) c.classList.remove('drop-here', 'drop-date');
    if (on) on.classList.add(cls);
  };
  const ghostAt = (x, y) => setRules('cal-ghost', `#drag-ghost { transform: translate(${Math.round(x) + 14}px, ${Math.round(y) + 10}px); }`);
  function endDrag(commit, x, y) {
    if (!drag) return;
    const d = drag;
    const cell = d.active && commit ? cellAt(x, y) : null;
    showAim(null);
    drag = null;
    if (!d.active) return;
    swallowClick = true;
    setTimeout(() => (swallowClick = false), 0);
    grid.classList.remove('dragging');
    const ghost = document.getElementById('drag-ghost');
    if (ghost) ghost.remove();
    setRules('cal-ghost', '');
    const to = calendarDrop(d, cell);
    if (to && to.strip !== undefined) attempt(() => actions.moveStrip(dto.board, to.strip, to.at));
    else if (to) attempt(() => actions.moveEvent(to.event, to.date));
  }
  grid.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || !e.target.closest) return;
    const st = e.target.closest('.cal-strip[data-strip]');
    const chip = st ? null : e.target.closest('.cal-ev[data-event]');
    if (!st && !chip) return;
    drag = { kind: st ? 'strip' : 'event', id: Number((st || chip).dataset[st ? 'strip' : 'event']), text: (st || chip).textContent, x: e.clientX, y: e.clientY, active: false, pointer: e.pointerId };
  });
  grid.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    if (!drag.active) {
      if (!dragStarted(drag.x, drag.y, e.clientX, e.clientY)) return;
      try {
        grid.setPointerCapture(e.pointerId);
      } catch {
        // The pointer may already be gone; the drag still works while it is over the month.
      }
      drag.active = true;
      grid.classList.add('dragging');
      document.body.append(el('div', { class: 'drag-ghost', text: drag.text, attrs: { id: 'drag-ghost', 'aria-hidden': 'true' } }));
    }
    e.preventDefault();
    ghostAt(e.clientX, e.clientY);
    showAim(cellAt(e.clientX, e.clientY));
  });
  grid.addEventListener('pointerup', (e) => {
    if (drag && e.pointerId === drag.pointer) endDrag(true, e.clientX, e.clientY);
  });
  grid.addEventListener('pointercancel', () => endDrag(false));
  grid.addEventListener('lostpointercapture', () => {
    if (drag && drag.active) endDrag(false);
  });
  // The click that ends a drag picks nothing.
  grid.addEventListener(
    'click',
    (e) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
  // Escape puts it back.
  document.addEventListener(
    'keydown',
    (e) => {
      if (drag && drag.active && e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        endDrag(false);
      }
    },
    true,
  );

  function drawMonth() {
    const rows = dto.weeks.map((w) =>
      el(
        'tr',
        {},
        ...w.map((d) => {
          const cls = ['cal-day', `k-${d.kind}`, d.in_month ? '' : 'outside', d.date === picked ? 'picked' : ''].filter(Boolean).join(' ');
          const off = hidden();
          const events = off.has('events') ? [] : d.events.map((i) => dto.events[i]).filter(Boolean);
          const flags = off.has('red_flags') ? [] : d.red_flags || [];
          const flagText = flags.length === 1 ? 'Red flag: ' + flags[0] : flags.length ? `${flags.length} red flags: ${flags.join('; ')}` : '';
          // Conflicts on the date (decisions.md, entry 83) and the flag type's color (entry 84).
          const clash = d.conflicts || [];
          const clashText = clash.length === 1 ? `Conflict: ${clash[0]}` : clash.length ? `${clash.length} conflicts: ${clash.join('; ')}` : '';
          const flagType = flags.length && d.red_flag_types && d.red_flag_types.length ? ` rft-${Number(d.red_flag_types[0])}` : '';
          return el(
            'td',
            { class: `${d.date === dto.today ? 'cal-is-today' : ''}`, attrs: { role: 'gridcell', 'aria-selected': d.date === picked ? 'true' : 'false' }, data: d.drop_at !== null && d.drop_at !== undefined ? { drop: d.drop_at } : {} },
            el(
              'button',
              {
                class: `${flags.length ? `${cls} flagged${flagType}` : cls}${clash.length ? ' conflicted' : ''}`,
                title: `${longDate(d.date)}${dayLabel(d) ? `, ${dayLabel(d)}` : ''}${flagText ? `. ${flagText}` : ''}${clashText ? `. ${clashText}` : ''}`,
                attrs: { type: 'button', id: `cal-${d.date}`, tabindex: d.date === picked ? '0' : '-1' },
                data: { date: d.date },
                on: { click: () => pick(d.date) },
              },
              el(
                'span',
                { class: 'cal-num', text: String(d.day) },
                // Holidays carry a star, company travel days a plane (behavior note 22).
                d.kind === 'holiday' ? el('span', { class: 'cal-mark', text: '★', attrs: { role: 'img', 'aria-label': 'Holiday' } }) : null,
                d.kind === 'move' ? el('span', { class: 'cal-mark', text: '✈', attrs: { role: 'img', 'aria-label': 'Company travel day' } }) : null,
                clash.length ? el('span', { class: 'cf-mark', text: '⚠', attrs: { role: 'img', 'aria-label': clashText } }) : null,
                flags.length ? el('span', { class: `rf-mark${flagType}`, text: '⚑', attrs: { role: 'img', 'aria-label': flagText } }) : null,
              ),
              el('span', { class: 'cal-kind', text: dayLabel(d) }),
              // An event drags to another date, keeping its length (decisions.md, entry 83).
              ...events.slice(0, 3).map((ev) => el('span', { class: `cal-ev ${ev.counts ? 'counts' : ''}${colorClass(ev)}`, text: eventText(ev), title: `${eventText(ev)}. Drag to another date to move it.`, data: { event: ev.index } })),
              events.length > 3 ? el('span', { class: 'cal-ev', text: `and ${events.length - 3} more` }) : null,
            ),
            stripList(d),
          );
        }),
      ),
    );
    grid.replaceChildren(el('thead', {}, el('tr', {}, ...(dto.week || []).map((h) => el('th', { text: h, attrs: { scope: 'col' } })))), el('tbody', {}, ...rows));
    grid.classList.toggle('cal-span', Boolean(dto.span));
    grid.setAttribute('aria-label', dto.span ? 'Weeks' : 'Month');
    if (!picked || !document.getElementById(`cal-${picked}`)) {
      const first = dto.weeks.flat().find((d) => d.in_month);
      if (first) {
        const b = grid.querySelector(`[data-date="${first.date}"]`);
        if (b) b.tabIndex = 0;
      }
    }
  }

  // ---- The picked date.
  const sideTitle = el('h3', {});
  const kindInputs = DAY_KINDS.map(([kind, label]) => {
    const input = el('input', { attrs: { id: `cal-kind-${kind}`, type: 'radio', name: 'cal-kind', value: kind } });
    input.addEventListener('change', () => {
      if (input.checked && picked) attempt(() => actions.setDayKind(picked, kind));
    });
    return { kind, input, node: el('label', { class: 'el-check', attrs: { for: `cal-kind-${kind}` } }, input, el('span', { text: label })) };
  });
  const sideEvents = el('ul', { class: 'cal-list' });
  const sideFlagsHead = el('h3', { text: 'Red flags on this date' });
  const sideFlags = el('ul', { class: 'cal-list', attrs: { 'aria-label': 'Red flags on this date' } });
  const newHere = el('button', { class: 'btn', text: 'New Event', attrs: { type: 'button' } });
  newHere.addEventListener('click', () => picked && editEvent(null, picked));
  const actionsBtn = el('button', { class: 'btn', text: 'Actions…', attrs: { type: 'button', id: 'cal-actions', 'aria-haspopup': 'menu', title: 'Working day, day off, company travel, holiday, an event, a red flag, or the start date' } });
  actionsBtn.addEventListener('click', () => {
    if (!picked) return;
    const r = actionsBtn.getBoundingClientRect();
    actionsMenu(picked, r.left, r.bottom, actionsBtn);
  });
  const side = el(
    'aside',
    { class: 'el-panel cal-side', attrs: { 'aria-label': 'The picked date' } },
    el('div', { class: 'el-row' }, sideTitle, el('span', { class: 'bd-spacer' }), actionsBtn),
    el('fieldset', { class: 'cal-kinds' }, el('legend', { text: 'This date is' }), ...kindInputs.map((k) => k.node)),
    sideFlagsHead,
    sideFlags,
    el('h3', { text: 'Events on this date' }),
    sideEvents,
    el('div', {}, newHere),
  );

  function day(date) {
    return dto ? dto.weeks.flat().find((d) => d.date === date) || null : null;
  }

  function eventItem(ev) {
    return el(
      'li',
      { class: 'cal-item' },
      el('span', { class: `cal-badge ${ev.counts ? 'counts' : ''}${colorClass(ev)}`, text: kindText(ev) }),
      el('span', { class: 'cal-item-text', text: `${ev.name || 'No name'} · ${ev.from === ev.to ? showDate(ev.from) : `${showDate(ev.from)} to ${showDate(ev.to)}`}${ev.element_names.length ? ` · ${ev.element_names.join(', ')}` : ''}` }),
      el('button', { class: 'btn', text: 'Edit', attrs: { type: 'button', 'aria-label': `Edit ${eventText(ev)}` }, on: { click: () => editEvent(ev, null) } }),
      el('button', { class: 'btn', text: 'Delete', attrs: { type: 'button', 'aria-label': `Delete ${eventText(ev)}` }, on: { click: () => removeEvent(ev) } }),
    );
  }

  function drawSide() {
    const d = picked && day(picked);
    side.hidden = !d;
    if (!d) return;
    sideTitle.textContent = `${longDate(d.date)}${d.shoot_day ? `, shoot day ${d.shoot_day}` : ''}`;
    for (const k of kindInputs) k.input.checked = k.kind === d.kind;
    const evs = d.events.map((i) => dto.events[i]).filter(Boolean);
    sideEvents.replaceChildren(...(evs.length ? evs.map(eventItem) : [el('li', { class: 'empty', text: 'None.' })]));
    const flags = d.red_flags || [];
    sideFlagsHead.hidden = sideFlags.hidden = !flags.length;
    sideFlags.replaceChildren(...flags.map((f) => el('li', { class: 'cal-item' }, el('span', { class: 'rf-mark', text: '⚑', attrs: { 'aria-hidden': 'true' } }), el('span', { class: 'cal-item-text', text: f }))));
  }

  // ---- Every event.
  const allEvents = el('ul', { class: 'cal-list' });
  const newEvent = el('button', { class: 'btn', text: 'New Event', attrs: { type: 'button' } });
  newEvent.addEventListener('click', () => editEvent(null, picked || (dto && (dto.first_day || dto.start)) || null));
  const eventsPanel = el(
    'section',
    { class: 'el-panel', attrs: { 'aria-label': 'Events' } },
    el('div', { class: 'el-row' }, el('h2', { text: 'Events' }), el('span', { class: 'bd-spacer' }), newEvent),
    el('p', { class: 'bd-hint', text: 'Travel, fittings and rehearsals count in the day out of days on every date they cover. Unavailable, camera tests, post-production work and other events show here only.' }),
    allEvents,
  );

  function drawEvents() {
    allEvents.replaceChildren(...(dto.events.length ? dto.events.map(eventItem) : [el('li', { class: 'empty', text: 'No events yet.' })]));
  }

  async function removeEvent(ev) {
    const ok = await confirmDialog({
      title: 'Delete this event?',
      message: `${eventText(ev)} leaves the calendar${ev.counts ? ' and the day out of days' : ''}. Undo brings it back.`,
      confirmText: 'Delete Event',
      danger: true,
    });
    if (ok) attempt(() => actions.deleteEvent(ev.index));
  }

  /** The event editor: a new event from `date`, or `ev` to change; `preset` picks elements for a new one. */
  function editEvent(ev, date, preset = []) {
    const today = date || (dto && dto.start) || new Date().toISOString().slice(0, 10);
    return customDialog((close) => {
      const kind = el('select', { attrs: { id: 'cal-ev-kind', 'data-autofocus': true } }, ...EVENT_KINDS.map(([k, label]) => el('option', { text: label, attrs: { value: k } })));
      kind.value = ev ? ev.kind : 'travel';
      const label = el('input', { class: 'w-m', attrs: { id: 'cal-ev-label', type: 'text', autocomplete: 'off', value: ev ? ev.label : '', placeholder: 'Camera test' } });
      const labelField = el('label', { class: 'bd-field', attrs: { for: 'cal-ev-label' } }, el('span', { text: 'What kind' }), label);
      const name = el('input', { class: 'w-l', attrs: { id: 'cal-ev-name', type: 'text', autocomplete: 'off', value: ev ? ev.name : '' } });
      // Text fields, not date controls (decision 49): Rust reads the typed dates.
      const from = dateInput({ class: 'w-m', id: 'cal-ev-from', value: ev ? ev.from : today });
      const to = dateInput({ class: 'w-m', id: 'cal-ev-to', value: ev ? ev.to : today });
      from.addEventListener('change', () => {
        const [a, b] = [typedDate(from.value), typedDate(to.value)];
        if (a && b && a > b) to.value = a;
      });
      // A color from the ten, or none (decision 109).
      const colorName = `cal-ev-color-${Math.random().toString(36).slice(2, 8)}`;
      const colorPick = el(
        'div',
        { class: 'ev-colors', attrs: { role: 'radiogroup', 'aria-label': 'Color' } },
        ...[['', 'None'], ...EVENT_COLORS].map(([k, label]) => {
          const id = `${colorName}-${k || 'none'}`;
          const input = el('input', { attrs: { id, type: 'radio', name: colorName, value: k, checked: (ev ? ev.color || '' : '') === k } });
          return el('label', { class: 'ev-color', attrs: { for: id, title: label } }, input, el('span', { class: `ev-sw${k ? ` ev-c-${k}` : ' ev-none'}`, attrs: { 'aria-hidden': 'true' } }), el('span', { class: 'ev-color-name', text: label }));
        }),
      );
      const pickedColor = () => {
        const on = colorPick.querySelector('input:checked');
        return on && on.value ? on.value : null;
      };
      const showLabel = () => (labelField.hidden = kind.value !== 'other');
      kind.addEventListener('change', showLabel);
      showLabel();

      // Elements, by category, with a filter.
      const chosen = new Set(ev ? ev.elements : preset);
      const filter = el('input', { attrs: { id: 'cal-ev-filter', type: 'text', autocomplete: 'off', placeholder: 'Filter', 'aria-label': 'Filter elements' } });
      const count = el('span', { class: 'el-count' });
      const box = el('div', { class: 'cal-pick', attrs: { role: 'group', 'aria-label': 'Elements' } });
      const drawPick = () => {
        const t = filter.value.trim().toLowerCase();
        const groups = new Map();
        for (const e of dto.elements) {
          if (t && !e.name.toLowerCase().includes(t) && !e.board_id.toLowerCase().includes(t)) continue;
          if (!groups.has(e.category)) groups.set(e.category, []);
          groups.get(e.category).push(e);
        }
        box.replaceChildren(
          ...(groups.size
            ? [...groups].map(([cat, els]) =>
                el(
                  'div',
                  { class: 'cal-pick-group' },
                  el('h4', { text: cat }),
                  ...els.map((e) => {
                    const id = `cal-ev-el-${e.id}`;
                    const input = el('input', { attrs: { id, type: 'checkbox', checked: chosen.has(e.id) } });
                    input.addEventListener('change', () => {
                      if (input.checked) chosen.add(e.id);
                      else chosen.delete(e.id);
                      count.textContent = `${chosen.size} picked`;
                    });
                    return el('label', { class: 'el-check', attrs: { for: id } }, input, el('span', { text: e.board_id ? `${e.board_id} ${e.name}` : e.name }));
                  }),
                ),
              )
            : [el('p', { class: 'empty', text: dto.elements.length ? 'No element matches.' : 'No elements yet. Add them on a breakdown sheet.' })]),
        );
        count.textContent = `${chosen.size} picked`;
      };
      filter.addEventListener('input', drawPick);
      drawPick();

      const problem = errorLine();
      const save = async () => {
        const event = { kind: kind.value, label: kind.value === 'other' ? label.value : '', name: name.value, from: from.value, to: to.value, elements: dto.elements.filter((e) => chosen.has(e.id)).map((e) => e.id), color: pickedColor() };
        try {
          await actions.saveEvent(ev ? ev.index : null, event);
          close(true);
        } catch (e) {
          problem.textContent = String(e);
          problem.hidden = false;
        }
      };
      return el(
        'div',
        { class: 'modal modal-wide', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' } },
        el('h2', { class: 'modal-title', text: ev ? 'Edit event' : 'New event', attrs: { id: 'modal-title' } }),
        problem,
        el(
          'div',
          { class: 'el-row' },
          el('label', { class: 'bd-field', attrs: { for: 'cal-ev-kind' } }, el('span', { text: 'Kind' }), kind),
          labelField,
          el('label', { class: 'bd-field', attrs: { for: 'cal-ev-name' } }, el('span', { text: 'Name (optional)' }), name),
        ),
        el(
          'div',
          { class: 'el-row' },
          el('label', { class: 'bd-field', attrs: { for: 'cal-ev-from' } }, el('span', { text: 'From' }), from),
          el('label', { class: 'bd-field', attrs: { for: 'cal-ev-to' } }, el('span', { text: 'To' }), to),
        ),
        el('div', { class: 'el-row' }, el('span', { class: 'el-label', text: 'Color' }), colorPick),
        el('div', { class: 'el-row' }, el('span', { class: 'el-label', text: 'Elements' }), filter, count),
        box,
        el(
          'div',
          { class: 'modal-actions' },
          el('button', { class: 'btn', text: 'Cancel', attrs: { type: 'button' }, on: { click: () => close(null) } }),
          el('button', { class: 'btn btn-primary', text: 'Save Event', attrs: { type: 'button' }, on: { click: save } }),
        ),
      );
    });
  }

  // ---- Picking dates.
  function pick(date, focus = false) {
    picked = date;
    for (const b of grid.querySelectorAll('.cal-day')) {
      const on = b.dataset.date === date;
      b.classList.toggle('picked', on);
      b.tabIndex = on ? 0 : -1;
      b.parentElement.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    drawSide();
    const b = document.getElementById(`cal-${date}`);
    if (b && focus) b.focus({ preventScroll: false });
  }

  /** Picks `date`, showing its month first when it isn't in view. */
  async function goTo(date, focus = true) {
    if (day(date) && day(date).in_month) {
      pick(date, focus);
      return;
    }
    picked = date;
    const [y, m] = date.split('-').map(Number);
    await actions.month(y, m);
    pick(date, focus);
  }

  const body = el('div', { class: 'cal-body' }, el('div', { class: 'cal-main' }, grid), side);
  host.replaceChildren(el('div', { class: 'cal-tab' }, head, note, error, weekRow, viewRow, showRow, body, eventsPanel));

  function render(next) {
    dto = next;
    if (Array.isArray(dto.event_kinds) && dto.event_kinds.length) EVENT_KINDS = dto.event_kinds;
    if (Array.isArray(dto.event_colors)) EVENT_COLORS = dto.event_colors;
    title.textContent = `Calendar: ${dto.sub_board}`;
    monthTitle.textContent = dto.title;
    firstDay.disabled = !dto.first_day;
    monthView.setAttribute('aria-pressed', dto.span ? 'false' : 'true');
    weeksView.setAttribute('aria-pressed', dto.span ? 'true' : 'false');
    for (const b of monthButtons) b.hidden = Boolean(dto.span);
    const outside = dto.span && dto.outside_events
      ? ` ${dto.outside_events === 1 ? '1 event is' : `${dto.outside_events} events are`} outside this span, more than 26 weeks away; see Events.`
      : '';
    note.textContent = (dto.start
      ? `Shoot days start ${longDate(dto.start)}.`
      : `Set a start date for ${dto.sub_board} on the Board tab to number the shoot days.`) + outside;
    for (const w of week) w.input.checked = dto.weekly_off.includes(w.key);
    if (document.activeElement !== prep) prep.value = showDate(dto.prep_start, true);
    if (document.activeElement !== wrap) wrap.value = showDate(dto.wrap_end, true);
    drawFilter();
    drawShows();
    drawMonth();
    drawSide();
    drawEvents();
  }

  return { render, goTo, newEvent: (elements, date) => editEvent(null, date || (dto && (dto.first_day || dto.start)) || null, elements) };
}
