// Help > Keyboard Shortcuts: every command and its keys, made from the one shortcut table
// (shortcuts.js), so the sheet never drifts from the keys the app answers (decisions.md,
// entry 79). Grouped by the menu each command is in, then the keys the board, the
// Breakdown tab and the other panes answer. A filter narrows it by name or key.

import { el } from './dom.js';
import { customDialog } from './modal.js';
import { SHORTCUTS, keysFor, keyText } from './shortcuts.js';
import { filterShortcuts } from './logic.js';

/** The groups, in order: [title, test on an entry]. The first group that matches wins. */
const GROUPS = [
  ['File', (s) => s.id.startsWith('file.') || s.id === 'app.quit'],
  ['Settings', (s) => s.id === 'app.settings'],
  ['Edit', (s) => s.id.startsWith('edit.')],
  ['View', (s) => s.id.startsWith('view.')],
  ['Board menu', (s) => (s.id.startsWith('board.') || s.id.startsWith('boards.')) && s.scope !== 'board'],
  ['Breakdown menu', (s) => s.id.startsWith('breakdown.')],
  ['Plan menu', (s) => s.id.startsWith('plan.')],
  ['Help', (s) => s.id.startsWith('help.')],
  ['On the board', (s) => s.scope === 'board'],
  ['On the Breakdown tab', (s) => s.scope === 'sheet'],
  ['In the panes', (s) => s.scope === 'page'],
  // Anything a later menu adds still shows, so the sheet never leaves a command out.
  ['Other commands', () => true],
];

/** The table's entries by group: [{ title, rows: [{ label, keys }] }], empty groups left out. */
export function sheetGroups(table = SHORTCUTS) {
  const out = GROUPS.map(([title]) => ({ title, rows: [] }));
  for (const s of table) {
    const g = GROUPS.findIndex(([, test]) => test(s));
    if (g < 0) continue;
    const keys = keysFor(s).map(keyText);
    out[g].rows.push({ id: s.id, label: s.label, keys: keys.length ? keys.join(' or ') : '' });
  }
  return out.filter((g) => g.rows.length);
}

/** Shows the sheet. Resolves when it is closed. */
export function shortcutSheet() {
  return customDialog((close) => {
    const filter = el('input', { attrs: { id: 'ks-filter', type: 'search', placeholder: 'Filter by command or key', 'aria-label': 'Filter the shortcuts', autocomplete: 'off', spellcheck: 'false', 'data-autofocus': true } });
    const body = el('div', { class: 'ks-body' });
    const count = el('p', { class: 'bd-hint', attrs: { role: 'status', 'aria-live': 'polite' } });
    const groups = sheetGroups();
    function draw() {
      let shown = 0;
      const tables = [];
      for (const { title, rows } of filterShortcuts(groups, filter.value)) {
        shown += rows.length;
        tables.push(
          el(
            'section',
            { class: 'ks-group', attrs: { 'aria-label': title } },
            el('h3', { text: title }),
            el(
              'table',
              { class: 'summary ks-table' },
              el(
                'tbody',
                {},
                ...rows.map((r) => el('tr', { data: { id: r.id } }, el('td', { class: 'ks-what', text: r.label }), el('td', { class: r.keys ? 'ks-keys' : 'ks-keys ks-none', text: r.keys || 'Menu only' }))),
              ),
            ),
          ),
        );
      }
      body.replaceChildren(...tables);
      count.textContent = shown === 1 ? '1 command' : `${shown} commands`;
    }
    filter.addEventListener('input', draw);
    draw();
    return el(
      'div',
      { class: 'modal modal-wider ks', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ks-title' } },
      el('h2', { class: 'modal-title', text: 'Keyboard Shortcuts', attrs: { id: 'ks-title' } }),
      el('div', { class: 'el-row' }, filter, count),
      body,
      el('div', { class: 'modal-actions' }, el('button', { class: 'btn btn-primary', text: 'Close', attrs: { type: 'button' }, on: { click: () => close(null) } })),
    );
  });
}
