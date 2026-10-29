// The Conflicts tab: one element on one date in two or more sub-boards of the board shown,
// and a travel day, fitting or rehearsal on a date the element works on the same sub-board
// (conflicts_view, src/conflicts.rs; decisions.md 28, 34 and 43). Apart, and labeled as
// informational, the event clashes across sub-boards and the sub-boards with no dates,
// which are never conflicts. A click on a scene goes to its strip on the Board tab; a click on a date or
// an event goes to the Calendar tab on that date; an undated sub-board goes to its start
// date. Schedule text only reaches the page through textContent.

import { el } from './dom.js';
import { dayDate, showDate } from './dates.js';

/**
 * Builds the tab in `host`. `actions`: goStrip(subBoard, strip), goDate(subBoard, date),
 * goStart(subBoard). Returns { render(dto) }.
 */
export function createConflicts(host, actions) {
  function sheetButtons(bk) {
    return bk.sheets.map((sh) =>
      sh.strip === null || sh.strip === undefined
        ? el('span', { class: 'cf-scene', text: sh.scene })
        : el('button', {
            class: 'cf-link',
            text: sh.scene,
            title: `Show ${sh.scene} on ${bk.sub_board_name}, day ${bk.day}`,
            attrs: { type: 'button' },
            on: { click: () => actions.goStrip(bk.sub_board, sh.strip) },
          }),
    );
  }

  function booking(bk) {
    return el('li', { class: 'cf-booking' }, el('span', { class: 'cf-where', text: `${bk.sub_board_name}, day ${bk.day}:` }), ...sheetButtons(bk));
  }

  function dateButton(sub, date, weekday) {
    return el('button', {
      class: 'cf-link cf-date',
      text: dayDate(weekday, date),
      title: `Show ${showDate(date)} on the Calendar tab`,
      attrs: { type: 'button' },
      on: { click: () => actions.goDate(sub, date) },
    });
  }

  function conflict(c) {
    return el(
      'li',
      { class: 'cf-item' },
      el(
        'div',
        { class: 'cf-head' },
        el('span', { class: 'cf-name', text: c.name }),
        el('span', { class: 'cf-cat', text: c.category }),
        dateButton(c.bookings[0].sub_board, c.date, c.weekday),
      ),
      el('ul', { class: 'cf-bookings' }, ...c.bookings.map(booking)),
    );
  }

  function onWork(c) {
    return el(
      'li',
      { class: 'cf-item' },
      el(
        'div',
        { class: 'cf-head' },
        el('span', { class: 'cf-name', text: c.name }),
        el('span', { class: 'cf-cat', text: c.category }),
        dateButton(c.sub_board, c.date, c.weekday),
      ),
      el(
        'ul',
        { class: 'cf-bookings' },
        el(
          'li',
          { class: 'cf-booking' },
          el('span', { class: 'cf-where', text: `${c.sub_board_name}, day ${c.day}, a work day:` }),
          el('button', {
            class: 'cf-link',
            text: c.event,
            title: `Show ${showDate(c.date)} on ${c.sub_board_name}'s calendar`,
            attrs: { type: 'button' },
            on: { click: () => actions.goDate(c.sub_board, c.date) },
          }),
        ),
      ),
    );
  }

  function clash(c) {
    const events = c.events.map((ev) =>
      el(
        'li',
        { class: 'cf-booking' },
        el('span', { class: 'cf-where', text: `Event on ${ev.sub_board_name}:` }),
        el('button', {
          class: 'cf-link',
          text: ev.name,
          title: `Show ${showDate(c.date)} on ${ev.sub_board_name}'s calendar`,
          attrs: { type: 'button' },
          on: { click: () => actions.goDate(ev.sub_board, c.date) },
        }),
      ),
    );
    return el(
      'li',
      { class: 'cf-item cf-info' },
      el(
        'div',
        { class: 'cf-head' },
        el('span', { class: 'cf-name', text: c.name }),
        el('span', { class: 'cf-cat', text: c.category }),
        dateButton(c.events[0].sub_board, c.date, c.weekday),
      ),
      el('ul', { class: 'cf-bookings' }, ...events, ...c.bookings.map(booking)),
    );
  }

  function render(dto) {
    const count = dto.count === 1 ? '1 conflict' : `${dto.count} conflicts`;
    const parts = [
      el('h2', { text: `Conflicts on ${dto.board_name}` }),
      el('p', {
        class: 'cf-note',
        text: 'A conflict is one element working on the same date in two or more sub-boards of this board, or a travel day, fitting or rehearsal on a date it works on the same sub-board. Only work days count, not holds; elements left off the board are left out.',
      }),
    ];
    const shown = dto.conflicts.length + dto.on_work.length;
    if (!dto.count) parts.push(el('p', { class: 'empty', text: 'No conflicts on this board.' }));
    else {
      parts.push(el('p', { class: 'cf-count', text: shown < dto.count ? `${count}. Showing the first ${shown}.` : `${count}.` }));
      if (dto.conflicts.length) parts.push(el('ul', { class: 'cf-list', attrs: { 'aria-label': 'Conflicts' } }, ...dto.conflicts.map(conflict)));
      if (dto.on_work.length)
        parts.push(
          el('h3', { text: 'Events on work days' }),
          el('ul', { class: 'cf-list', attrs: { 'aria-label': 'Events on work days' } }, ...dto.on_work.map(onWork)),
        );
    }

    const info = el(
      'section',
      { class: 'cf-section', attrs: { 'aria-label': 'Informational, not conflicts' } },
      el('h3', { text: 'Informational, not conflicts' }),
      el('p', {
        class: 'cf-note',
        text: 'These are not conflicts. They are listed so you can check them: an element with two or more events on one date, or an event in one sub-board on a date it works in another.',
      }),
    );
    if (!dto.clash_count) info.append(el('p', { class: 'empty', text: 'No event clashes.' }));
    else {
      const n = dto.clash_count === 1 ? '1 event clash' : `${dto.clash_count} event clashes`;
      info.append(
        el('p', { class: 'cf-count', text: dto.event_clashes.length < dto.clash_count ? `${n}. Showing the first ${dto.event_clashes.length}.` : `${n}.` }),
        el('ul', { class: 'cf-list', attrs: { 'aria-label': 'Event clashes' } }, ...dto.event_clashes.map(clash)),
      );
    }
    if (dto.undated.length) {
      info.append(
        el('h3', { text: 'Sub-boards not compared' }),
        el('p', { class: 'cf-note', text: 'These have no dates (no start date, or no working day), so they take no part.' }),
        el(
          'ul',
          { class: 'cf-list', attrs: { 'aria-label': 'Sub-boards not compared' } },
          ...dto.undated.map((sb) =>
            el(
              'li',
              { class: 'cf-item cf-info' },
              el('button', {
                class: 'cf-link',
                text: sb.name,
                title: `Set a start date for ${sb.name} on the Board tab`,
                attrs: { type: 'button' },
                on: { click: () => actions.goStart(sb.id) },
              }),
            ),
          ),
        ),
      );
    }
    parts.push(info);
    host.replaceChildren(el('div', { class: 'cf-tab' }, ...parts));
  }

  return { render };
}
