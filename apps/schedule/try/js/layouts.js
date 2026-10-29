// Board > Layouts (decisions.md, entry 78): the schedule's named layouts of scene strips,
// day breaks and shoot day strips. Rename in place, Up and Down, Delete (a second click
// confirms), and save the checked ones (or all) to a layout file, or load one. Which
// layout a board uses is picked in Strip Layout and Day Breaks; this lists them all.

import { el } from './dom.js';
import { customDialog, errorLine } from './modal.js';
import { nameToSend } from './logic.js';

const KIND_LABEL = { strips: 'Strips', day_breaks: 'Day breaks', shoot_day: 'Shoot day' };

/**
 * opts: { layouts() (the view's list, read after every change), rename(id, name),
 * move(id, to), remove(id), exportFile(ids), importFile() }. Each returns a promise;
 * a rejection is a sentence shown in the dialog. Resolves when closed.
 */
export function layoutsDialog({ layouts, rename, move, remove, exportFile, importFile }) {
  return customDialog((close, later) => {
    const error = errorLine();
    const checked = new Set();
    const list = el('ol', { class: 'ly-list mg-list', attrs: { 'aria-label': 'Named layouts' } });
    // The redraw waits for a click in progress (decisions.md, entry 170): a name sent as
    // its field loses focus to a press on Up or Done would otherwise move the button.
    const run = async (pending) => {
      try {
        await pending;
        error.hidden = true;
      } catch (e) {
        error.textContent = String(e);
        error.hidden = false;
      }
      later(draw);
    };

    function draw() {
      const all = layouts();
      for (const id of [...checked]) if (!all.some((l) => l.id === id)) checked.delete(id);
      if (!all.length) {
        list.replaceChildren(el('li', { class: 'empty', text: 'No named layouts yet. Save one from Strip Layout or Day Breaks, or load a layout file.' }));
        return;
      }
      list.replaceChildren(
        ...all.map((l, i) => {
          const pick = el('input', { attrs: { type: 'checkbox', checked: checked.has(l.id), 'aria-label': `Save ${l.name} to a file` } });
          pick.addEventListener('change', () => (pick.checked ? checked.add(l.id) : checked.delete(l.id)));
          const name = el('input', { class: 'w-m', attrs: { type: 'text', value: l.name, maxlength: '200', 'aria-label': `Name of ${l.name}` } });
          // Each name goes once, and not from a field a redraw took away (entry 151).
          let sent = null;
          name.addEventListener('change', () => {
            if (!name.isConnected) return;
            const typed = nameToSend(l.name, sent, name.value);
            if (typed === null) return;
            sent = typed;
            run(rename(l.id, typed));
          });
          name.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') name.blur();
          });
          const used = [l.boards ? (l.boards === 1 ? '1 board' : `${l.boards} boards`) : '', l.one_line ? 'one-line report' : ''].filter(Boolean).join(', ');
          const del = el('button', {
            class: 'btn',
            text: 'Delete',
            attrs: { type: 'button', 'aria-label': `Delete ${l.name}` },
            on: {
              click: () => {
                if (del.dataset.sure !== '1') {
                  del.dataset.sure = '1';
                  del.textContent = 'Delete it?';
                  return;
                }
                run(remove(l.id));
              },
            },
          });
          return el(
            'li',
            { class: 'ly-row ly-lib' },
            el('span', { class: 'ly-name' }, pick, name),
            el('span', { class: 'ly-kind', text: KIND_LABEL[l.kind] || l.kind }),
            el('span', { class: 'ly-used', text: used ? `Used by ${used}` : 'Not used' }),
            el('button', { class: 'btn', text: 'Up', attrs: { type: 'button', disabled: i === 0, 'aria-label': `Move ${l.name} up` }, on: { click: () => run(move(l.id, i - 1)) } }),
            el('button', { class: 'btn', text: 'Down', attrs: { type: 'button', disabled: i === all.length - 1, 'aria-label': `Move ${l.name} down` }, on: { click: () => run(move(l.id, i + 1)) } }),
            del,
          );
        }),
      );
    }
    draw();

    return el(
      'div',
      { class: 'modal modal-wider', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'lb-title' } },
      el('h2', { class: 'modal-title', text: 'Layouts', attrs: { id: 'lb-title' } }),
      el('p', {
        class: 'modal-message',
        text: "The schedule's named layouts. A board picks its strip, day break and shoot day layouts in Strip Layout and Day Breaks; deleting one sends its boards back to their own. Save the checked layouts (or all) to a file to use them in another schedule.",
      }),
      error,
      list,
      el(
        'div',
        { class: 'modal-actions' },
        el('button', { class: 'btn', text: 'Load from File…', attrs: { type: 'button' }, on: { click: () => run(importFile()) } }),
        el('button', { class: 'btn', text: 'Save to File…', attrs: { type: 'button' }, on: { click: () => run(exportFile([...checked])) } }),
        el('span', { class: 'bd-spacer' }),
        el('button', { class: 'btn btn-primary', text: 'Done', attrs: { type: 'button', 'data-autofocus': true }, on: { click: () => close(true) } }),
      ),
    );
  });
}
