// The Elements tab: the categories, one category's settings, and its elements with their
// counts and dates (elements_view, src/view.rs), plus editing one element. Rust checks
// and makes every change (src/elements.rs); this file lays the tab out and sends what was
// typed. Text fields commit when they are left (or on Enter), switches when clicked; each
// change is one undo step.
//
// The panels with fields are built once and then refreshed, so a redraw after a commit
// never moves focus or throws away what is being typed in another field.
//
// Below the categories, the header fields that work as categories (set, location, unit,
// episode, I/E, time of day, script day, sequence): their values with sheets, pages and days, read only. The table sorts by any
// column (click its heading; again to reverse), for this session only.

import { el, showThumb } from './dom.js';
import { showDate } from './dates.js';
import { confirmDialog, customDialog, errorLine } from './modal.js';
import { flagDialog, firmness } from './redflags.js';
import { nextSort, sortRows } from './logic.js';

/**
 * Builds the tab in `host`. `actions` (each returns a promise that rejects with a plain
 * message): show(category), showHeader(key), addCategory(name), setCategory(id, field,
 * value), moveCategory(id, to), deleteCategory(id), applyDefaults(id), addProperty(id,
 * name), renameProperty(id, at, name), moveProperty(id, at, to), deleteProperty(id, at),
 * setElement(id, field, value), setProperty(id, name, value), setLinks(id, links,
 * retroactive), addImage(id), removeImage(id, at), image(id, at) (a data URL or null),
 * days(id) (the element's days and dates), newEvent(ids), merge(survivor, others),
 * moveElement(id, category), renumber(category, start, order), deleteElement(id, unlink), and
 * for red flags types() (the view's list of red flag types), manageTypes(),
 * setFlag(element, input) and deleteFlag(id). Returns { render(dto), current(),
 * select(id, focus), focusCategory(focus) }.
 */
export function createElements(host, actions) {
  let dto = null;
  /** The element being edited, and the ones ticked for a merge. */
  let selected = null;
  const ticked = new Set();

  const error = errorLine('bd-error', { id: 'el-error' });
  let errorFor = null;

  function clearError(field) {
    if (error.hidden || (field && errorFor && field !== errorFor)) return;
    error.hidden = true;
    error.textContent = '';
    errorFor = null;
    for (const i of host.querySelectorAll('[aria-invalid="true"]')) i.removeAttribute('aria-invalid');
  }

  function showError(text, input, field) {
    clearError();
    error.textContent = String(text);
    error.hidden = false;
    errorFor = field || null;
    if (input) input.setAttribute('aria-invalid', 'true');
  }

  /** Runs an action; a refusal shows above the tab and marks `input`. */
  async function attempt(run, input = null, field = null) {
    try {
      await run();
      clearError(field);
      if (input) input.removeAttribute('aria-invalid');
      return true;
    } catch (e) {
      showError(e, input, field);
      return false;
    }
  }

  /** A one-line field that commits on change and on Enter. */
  function textInput(id, label, cls, onCommit) {
    const input = el('input', { class: cls, attrs: { id, type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-describedby': 'el-error' } });
    input.addEventListener('change', () => onCommit(input));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.dispatchEvent(new Event('change'));
    });
    return { input, node: el('label', { class: 'bd-field', attrs: { for: id } }, el('span', { text: label }), input) };
  }

  function checkbox(id, label, onCommit) {
    const input = el('input', { attrs: { id, type: 'checkbox' } });
    input.addEventListener('change', () => onCommit(input));
    return { input, node: el('label', { class: 'el-check', attrs: { for: id } }, input, el('span', { text: label })) };
  }

  /** Never overwrite what is being typed, nor a refused value waiting to be fixed. */
  function fill(input, value) {
    if (document.activeElement === input || input.getAttribute('aria-invalid') === 'true') return;
    if (input.type === 'checkbox') input.checked = Boolean(value);
    else input.value = value;
  }

  // ---- Categories (the side list)

  const catList = el('ul', { class: 'el-cats', attrs: { 'aria-label': 'Categories' } });
  const newCat = el('input', { attrs: { id: 'el-new-category', type: 'text', autocomplete: 'off', placeholder: 'New category', 'aria-label': 'New category name' } });
  const addCat = async () => {
    const name = newCat.value.trim();
    if (!name) return;
    if (await attempt(() => actions.addCategory(name), newCat, 'new-category')) newCat.value = '';
  };
  newCat.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addCat();
  });
  const headList = el('ul', { class: 'el-cats', attrs: { 'aria-label': 'Header fields' } });
  const side = el(
    'aside',
    { class: 'el-side' },
    el('h2', { text: 'Categories' }),
    catList,
    el('div', { class: 'el-add' }, newCat, el('button', { class: 'btn', text: 'Add', attrs: { type: 'button' }, on: { click: addCat } })),
    el('h2', { class: 'el-side-head', text: 'Header fields' }),
    headList,
  );

  /** The header field shown instead of a category, if any. */
  const header = () => (dto && dto.header ? dto.headers.find((h) => h.key === dto.header) || null : null);

  function category() {
    return dto ? dto.categories.find((c) => c.id === dto.category) || null : null;
  }

  // ---- The category's settings

  const cat = {
    title: el('h2', {}),
    name: textInput('el-cat-name', 'Name', 'w-l', (i) => {
      const c = category();
      if (c && i.value !== c.name) attempt(() => actions.setCategory(c.id, 'name', i.value), i, 'cat-name');
    }),
    up: el('button', { class: 'btn', text: 'Move Up', attrs: { type: 'button' } }),
    down: el('button', { class: 'btn', text: 'Move Down', attrs: { type: 'button' } }),
    del: el('button', { class: 'btn', text: 'Delete Category', attrs: { type: 'button' } }),
    builtIn: el('p', { class: 'bd-hint', text: 'Built in: it keeps its place and can be renamed but not deleted.' }),
    auto: checkbox('el-cat-auto', 'Number new elements automatically', (i) => {
      const c = category();
      if (c) attempt(() => actions.setCategory(c.id, 'auto_board_id', String(i.checked)), i);
    }),
    exclude: checkbox('el-cat-exclude', 'Off the board', (i) => {
      const c = category();
      if (c) attempt(() => actions.setCategory(c.id, 'exclude_from_board', String(i.checked)), i);
    }),
    daily: checkbox('el-cat-daily', 'Use in daily quantity', (i) => {
      const c = category();
      if (c) attempt(() => actions.setCategory(c.id, 'daily_quantity', String(i.checked)), i);
    }),
    props: el('div', { class: 'el-props', attrs: { role: 'group', 'aria-label': 'Custom properties' } }),
    newProp: el('input', { class: 'w-m', attrs: { id: 'el-new-prop', type: 'text', autocomplete: 'off', placeholder: 'New property', 'aria-label': 'New custom property name' } }),
    holds: checkbox('el-cat-holds', 'Holds', (i) => {
      const c = category();
      if (c) attempt(() => actions.setCategory(c.id, 'holds', String(i.checked)), i);
    }),
    drops: checkbox('el-cat-drops', 'Drops', (i) => {
      const c = category();
      if (c) attempt(() => actions.setCategory(c.id, 'drops', String(i.checked)), i);
    }),
    gap: textInput('el-cat-gap', 'Minimum drop gap (days)', 'w-xs', (i) => {
      const c = category();
      if (c && i.value !== c.min_drop_gap) attempt(() => actions.setCategory(c.id, 'min_drop_gap', i.value), i, 'cat-gap');
    }),
    apply: el('button', { class: 'btn', text: 'Apply to Existing Elements', attrs: { type: 'button' } }),
  };
  cat.up.addEventListener('click', () => {
    const c = category();
    if (c && c.place > 0) attempt(() => actions.moveCategory(c.id, c.place - 1));
  });
  cat.down.addEventListener('click', () => {
    const c = category();
    if (c && c.place !== null && c.place + 1 < c.user_count) attempt(() => actions.moveCategory(c.id, c.place + 1));
  });
  cat.del.addEventListener('click', () => {
    const c = category();
    if (c) attempt(() => actions.deleteCategory(c.id));
  });
  cat.apply.addEventListener('click', async () => {
    const c = category();
    if (!c) return;
    const ok = await confirmDialog({
      title: 'Apply to existing elements?',
      message: `Every element in ${c.name} gets these hold and drop rules and this off the board setting, replacing its own. Undo brings the old ones back.`,
      confirmText: 'Apply',
    });
    if (ok) attempt(() => actions.applyDefaults(c.id));
  });
  const catPanel = el(
    'section',
    { class: 'el-panel', attrs: { 'aria-label': 'Category settings' } },
    el('div', { class: 'el-row' }, cat.title),
    el('div', { class: 'el-row' }, cat.name.node, cat.up, cat.down, cat.del),
    cat.builtIn,
    el('div', { class: 'el-row' }, cat.auto.node, cat.daily.node),
    // Settings for new elements (behavior note 24; decision 120): off the board too.
    el('div', { class: 'el-row' }, el('span', { class: 'el-label', text: 'Defaults for new elements' }), cat.exclude.node, cat.holds.node, cat.drops.node, cat.gap.node, cat.apply),
    el('div', { class: 'el-row' }, el('span', { class: 'el-label', text: 'Custom properties' }), cat.props, cat.newProp),
  );
  cat.exclude.node.title = 'New elements in it show on no strip and never count as conflicts; Apply to Existing Elements reaches the others.';
  cat.daily.node.title = 'Quantities on each sheet add up in the daily category totals.';
  cat.newProp.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const c = category();
    const name = cat.newProp.value.trim();
    if (c && name && (await attempt(() => actions.addProperty(c.id, name), cat.newProp, 'new-prop'))) cat.newProp.value = '';
  });

  /** The category's properties, each a name field (renames on change) with its moves. */
  function drawProperties(c) {
    const keep = document.activeElement && cat.props.contains(document.activeElement) ? document.activeElement.id : null;
    cat.props.replaceChildren(
      ...c.properties.map((p, i) => {
        const input = el('input', { class: 'w-s', attrs: { id: `el-prop-${i}`, type: 'text', value: p, autocomplete: 'off', 'aria-label': `Property ${i + 1} name` } });
        input.addEventListener('change', () => {
          if (input.value !== p) attempt(() => actions.renameProperty(c.id, i, input.value), input, `prop-${i}`);
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') input.dispatchEvent(new Event('change'));
        });
        // One line or several (decision 119): the element's value field follows.
        const lines = el('select', { attrs: { id: `el-prop-lines-${i}`, 'aria-label': `${p} takes` } }, el('option', { text: 'One line', attrs: { value: 'one' } }), el('option', { text: 'Several lines', attrs: { value: 'many' } }));
        lines.value = (c.multi_line || []).includes(p) ? 'many' : 'one';
        lines.addEventListener('change', () => attempt(() => actions.setPropertyLines(c.id, i, lines.value === 'many'), lines, `prop-lines-${i}`));
        const left = el('button', { class: 'btn btn-mini', text: '‹', title: `Move ${p} earlier`, attrs: { type: 'button', 'aria-label': `Move ${p} earlier` }, on: { click: () => attempt(() => actions.moveProperty(c.id, i, i - 1)) } });
        left.disabled = i === 0;
        const del = el('button', { class: 'btn btn-mini', text: '×', title: `Delete ${p}`, attrs: { type: 'button', 'aria-label': `Delete property ${p}` } });
        del.addEventListener('click', async () => {
          const ok = await confirmDialog({
            title: 'Delete this property?',
            message: `${p} leaves ${c.name}, and every element's value of it goes too. Undo brings them back.`,
            confirmText: 'Delete Property',
            danger: true,
          });
          if (ok) attempt(() => actions.deleteProperty(c.id, i));
        });
        return el('span', { class: 'el-prop' }, input, lines, left, del);
      }),
    );
    if (keep) {
      const again = document.getElementById(keep);
      if (again) again.focus({ preventScroll: true });
    }
  }

  // ---- The elements

  const count = el('span', { class: 'el-count' });
  /** The column the table sorts by (null: the engine's order, board ID then name), and whether reversed. */
  let sortKey = null;
  let sortDown = false;
  const renumberBtn = el('button', { class: 'btn', text: 'Renumber', attrs: { type: 'button' } });
  const mergeBtn = el('button', { class: 'btn', text: 'Merge', attrs: { type: 'button' } });
  const note = el('p', { class: 'bd-hint' });
  const table = el('table', { class: 'summary el-table' });
  const listPanel = el(
    'section',
    { class: 'el-panel', attrs: { 'aria-label': 'Elements' } },
    el('div', { class: 'el-row' }, count, el('span', { class: 'bd-spacer' }), renumberBtn, mergeBtn),
    note,
    table,
  );

  renumberBtn.addEventListener('click', async () => {
    const c = category();
    if (!c) return;
    const start = await customDialog((close) => {
      const input = el('input', { class: 'w-s', attrs: { id: 'el-renumber-start', type: 'text', inputmode: 'numeric', value: '1', 'data-autofocus': true } });
      const go = () => close(input.value);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') go();
      });
      return el(
        'div',
        { class: 'modal', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' } },
        el('h2', { class: 'modal-title', text: `Renumber ${c.name}`, attrs: { id: 'modal-title' } }),
        el('p', { class: 'modal-message', text: 'Unlocked elements get numbers from this one, in the order shown. Numbers that locked elements use are skipped, and IDs with letters stay as they are.' }),
        el('label', { class: 'bd-field', attrs: { for: 'el-renumber-start' } }, el('span', { text: 'Start from' }), input),
        el(
          'div',
          { class: 'modal-actions' },
          el('button', { class: 'btn', text: 'Cancel', attrs: { type: 'button' }, on: { click: () => close(null) } }),
          el('button', { class: 'btn btn-primary', text: 'Renumber', attrs: { type: 'button' }, on: { click: go } }),
        ),
      );
    });
    // Sorted by a column, the order shown is sent; otherwise the usual order serves.
    if (start !== null) attempt(() => actions.renumber(c.id, start, sortKey ? sorted().map((e) => e.id) : null));
  });

  mergeBtn.addEventListener('click', async () => {
    const picked = dto.elements.filter((e) => ticked.has(e.id));
    if (picked.length < 2) return;
    const keep = await customDialog((close) => {
      let choice = picked[0].id;
      const options = picked.map((e, i) => {
        const id = `el-keep-${e.id}`;
        const radio = el('input', { attrs: { id, type: 'radio', name: 'el-keep', checked: i === 0, 'data-autofocus': i === 0 } });
        radio.addEventListener('change', () => (choice = e.id));
        const label = e.board_id ? `${e.board_id} ${e.name}` : e.name;
        return el('label', { class: 'el-check', attrs: { for: id } }, radio, el('span', { text: `${label} (${e.sheets === 1 ? '1 sheet' : `${e.sheets} sheets`})` }));
      });
      return el(
        'div',
        { class: 'modal', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' } },
        el('h2', { class: 'modal-title', text: 'Merge elements', attrs: { id: 'modal-title' } }),
        el('p', { class: 'modal-message', text: 'Choose the one to keep. The others merge into it: every sheet and event that listed any of them lists it once. Undo brings them back.' }),
        el('div', { class: 'el-options' }, ...options),
        el(
          'div',
          { class: 'modal-actions' },
          el('button', { class: 'btn', text: 'Cancel', attrs: { type: 'button' }, on: { click: () => close(null) } }),
          el('button', { class: 'btn btn-primary', text: 'Merge', attrs: { type: 'button' }, on: { click: () => close(choice) } }),
        ),
      );
    });
    if (keep === null) return;
    const others = picked.map((e) => e.id).filter((id) => id !== keep);
    selected = keep;
    ticked.clear();
    await attempt(() => actions.merge(keep, others));
  });

  // ---- One element

  function elem() {
    return dto ? dto.elements.find((e) => e.id === selected) || null : null;
  }

  const ed = {
    title: el('h2', {}),
    name: textInput('el-name', 'Name', 'w-l', (i) => {
      const e = elem();
      if (e && i.value !== e.name) attempt(() => actions.setElement(e.id, 'name', i.value), i, 'name');
    }),
    boardId: textInput('el-board-id', 'Board ID', 'w-s', (i) => {
      const e = elem();
      if (e && i.value !== e.board_id) attempt(() => actions.setElement(e.id, 'board_id', i.value), i, 'board-id');
    }),
    locked: checkbox('el-locked', 'Lock board ID', (i) => {
      const e = elem();
      if (e) attempt(() => actions.setElement(e.id, 'locked', String(i.checked)), i);
    }),
    exclude: checkbox('el-exclude', 'Leave off the board', (i) => {
      const e = elem();
      if (e) attempt(() => actions.setElement(e.id, 'exclude_from_board', String(i.checked)), i);
    }),
    holds: checkbox('el-holds', 'Holds', (i) => {
      const e = elem();
      if (e) attempt(() => actions.setElement(e.id, 'holds', String(i.checked)), i);
    }),
    drops: checkbox('el-drops', 'Drops', (i) => {
      const e = elem();
      if (e) attempt(() => actions.setElement(e.id, 'drops', String(i.checked)), i);
    }),
    gap: textInput('el-gap', 'Minimum drop gap (days)', 'w-xs', (i) => {
      const e = elem();
      if (e && i.value !== e.min_drop_gap) attempt(() => actions.setElement(e.id, 'min_drop_gap', i.value), i, 'gap');
    }),
    notes: el('textarea', { attrs: { id: 'el-notes', rows: '2', 'aria-label': 'Notes', spellcheck: 'true' } }),
    props: el('div', { class: 'el-row el-prop-values', attrs: { role: 'group', 'aria-label': 'Property values' } }),
    links: el('span', { class: 'el-links' }),
    linkedBy: el('span', { class: 'el-links bd-hint' }),
    editLinks: el('button', { class: 'btn', text: 'Linked Elements…', attrs: { type: 'button', id: 'el-edit-links' } }),
    images: el('div', { class: 'el-images', attrs: { role: 'list', 'aria-label': 'Images' } }),
    addImage: el('button', { class: 'btn', text: 'Add Image…', attrs: { type: 'button', id: 'el-add-image' } }),
    newEvent: el('button', { class: 'btn', text: 'New Event…', attrs: { type: 'button', id: 'el-new-event' } }),
    days: el('table', { class: 'summary el-days', attrs: { 'aria-label': 'Days and dates' } }),
    daysNote: el('p', { class: 'bd-hint' }),
    moveTo: el('select', { attrs: { id: 'el-move-to', 'aria-label': 'Move to category' } }),
    move: el('button', { class: 'btn', text: 'Move', attrs: { type: 'button' } }),
    del: el('button', { class: 'btn', text: 'Delete Element', attrs: { type: 'button' } }),
  };
  ed.notes.addEventListener('change', () => {
    const e = elem();
    if (e && ed.notes.value !== e.notes) attempt(() => actions.setElement(e.id, 'notes', ed.notes.value), ed.notes, 'notes');
  });
  ed.newEvent.addEventListener('click', () => {
    const e = elem();
    if (e) actions.newEvent([e.id]);
  });
  ed.addImage.addEventListener('click', () => {
    const e = elem();
    if (e) attempt(() => actions.addImage(e.id));
  });
  ed.editLinks.addEventListener('click', async () => {
    const e = elem();
    if (!e) return;
    const picked = await linksDialog(e);
    if (picked) attempt(() => actions.setLinks(e.id, picked.links, picked.retroactive));
  });

  /** The linked elements editor: every other element, ticked when `e` links to it. */
  function linksDialog(e) {
    return customDialog((close) => {
      const chosen = new Set(e.links);
      const filter = el('input', { attrs: { id: 'el-links-filter', type: 'text', autocomplete: 'off', placeholder: 'Filter', 'aria-label': 'Filter elements', 'data-autofocus': true } });
      const box = el('div', { class: 'cal-pick', attrs: { role: 'group', 'aria-label': 'Elements' } });
      const count = el('span', { class: 'el-count' });
      const draw = () => {
        const t = filter.value.trim().toLowerCase();
        const groups = new Map();
        for (const x of dto.all_elements) {
          if (x.id === e.id) continue;
          if (t && !x.name.toLowerCase().includes(t) && !x.board_id.toLowerCase().includes(t)) continue;
          if (!groups.has(x.category)) groups.set(x.category, []);
          groups.get(x.category).push(x);
        }
        box.replaceChildren(
          ...[...groups].map(([c, els]) =>
            el(
              'div',
              { class: 'cal-pick-group' },
              el('h4', { text: c }),
              ...els.map((x) => {
                const id = `el-link-${x.id}`;
                const input = el('input', { attrs: { id, type: 'checkbox', checked: chosen.has(x.id) } });
                input.addEventListener('change', () => {
                  if (input.checked) chosen.add(x.id);
                  else chosen.delete(x.id);
                  count.textContent = `${chosen.size} linked`;
                });
                return el('label', { class: 'el-check', attrs: { for: id } }, input, el('span', { text: x.board_id ? `${x.board_id} ${x.name}` : x.name }));
              }),
            ),
          ),
        );
        count.textContent = `${chosen.size} linked`;
      };
      filter.addEventListener('input', draw);
      draw();
      const retro = el('input', { attrs: { id: 'el-links-retro', type: 'checkbox' } });
      const order = () => dto.all_elements.filter((x) => chosen.has(x.id)).map((x) => x.id);
      return el(
        'div',
        { class: 'modal modal-wide', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' } },
        el('h2', { class: 'modal-title', text: `Linked elements of ${e.name}`, attrs: { id: 'modal-title' } }),
        el('p', { class: 'modal-message', text: `Adding ${e.name} to a sheet adds the elements ticked here. Taking one off the list removes nothing from sheets.` }),
        el('div', { class: 'el-row' }, filter, count),
        box,
        el('label', { class: 'el-check', attrs: { for: 'el-links-retro' } }, retro, el('span', { text: `Also add them to every sheet that already has ${e.name}` })),
        el(
          'div',
          { class: 'modal-actions' },
          el('button', { class: 'btn', text: 'Cancel', attrs: { type: 'button' }, on: { click: () => close(null) } }),
          el('button', { class: 'btn btn-primary', text: 'Save Links', attrs: { type: 'button' }, on: { click: () => close({ links: order(), retroactive: retro.checked }) } }),
        ),
      );
    });
  }

  ed.move.addEventListener('click', () => {
    const e = elem();
    const to = Number(ed.moveTo.value);
    if (e && Number.isInteger(to) && to !== dto.category) attempt(() => actions.moveElement(e.id, to));
  });
  ed.del.addEventListener('click', async () => {
    const e = elem();
    if (!e) return;
    const sheets = e.sheets === 1 ? '1 sheet' : `${e.sheets} sheets`;
    const ok = await confirmDialog(
      e.linked
        ? {
            title: 'Unlink and delete?',
            message: `${e.name} is linked to other elements. Deleting it removes those links, and it leaves its ${sheets} and any events. Undo brings it back.`,
            confirmText: 'Unlink and Delete',
            danger: true,
          }
        : {
            title: 'Delete this element?',
            message: `${e.name} leaves its ${sheets} and any events. Undo brings it back.`,
            confirmText: 'Delete Element',
            danger: true,
          },
    );
    if (ok && (await attempt(() => actions.deleteElement(e.id, e.linked)))) selected = null;
  });
  // ---- The element's red flags (src/redflags.rs)

  const flagList = el('table', { class: 'summary rf-table', attrs: { 'aria-label': 'Red flags' } });
  const addFlag = el('button', { class: 'btn', text: 'Add Red Flag…', attrs: { type: 'button', id: 'el-add-flag' } });
  const typesBtn = el('button', { class: 'btn', text: 'Red Flag Types…', attrs: { type: 'button' } });
  typesBtn.addEventListener('click', () => actions.manageTypes());

  function editFlag(e, f) {
    return flagDialog({
      element: e.name,
      flag: f,
      types: actions.types(),
      submit: async (input) => {
        await actions.setFlag(e.id, input);
        clearError();
      },
      manage: () => actions.manageTypes(),
    });
  }
  addFlag.addEventListener('click', () => {
    const e = elem();
    if (e) editFlag(e, null);
  });

  async function removeFlag(e, f) {
    const ok = await confirmDialog({
      title: 'Delete this red flag?',
      message: `${e.name}: ${f.type_name}, ${f.text}. Undo brings it back.`,
      confirmText: 'Delete Red Flag',
      danger: true,
    });
    if (ok) attempt(() => actions.deleteFlag(f.id));
  }

  function drawFlags(e) {
    const flags = e.red_flags || [];
    if (!flags.length) {
      flagList.replaceChildren(el('tbody', {}, el('tr', {}, el('td', { class: 'empty', text: 'No red flags. Add one for dates this element can’t work, or would rather not.' }))));
      return;
    }
    const head = el('tr', {}, ...['Type', 'Dates', 'Hard or soft', 'Note', ''].map((h) => el('th', { attrs: { scope: 'col' } }, h ? h : el('span', { class: 'visually-hidden', text: 'Actions' }))));
    const rows = flags.map((f) =>
      el(
        'tr',
        { data: { flag: f.id } },
        el('td', {}, el('span', { class: `rf-swatch rft-${Number(f.red_flag_type)}`, attrs: { 'aria-hidden': 'true' } }), f.type_name),
        el('td', { text: f.text }),
        el('td', { class: f.hard ? 'rf-firm hard' : 'rf-firm', text: firmness(f.hard) }),
        el('td', { class: 'rf-note', text: f.note }),
        el(
          'td',
          { class: 'rf-actions' },
          el('button', { class: 'btn', text: 'Edit', attrs: { type: 'button', 'aria-label': `Edit red flag ${f.type_name}, ${f.text}` }, on: { click: () => editFlag(e, f) } }),
          el('button', { class: 'btn', text: 'Delete', attrs: { type: 'button', 'aria-label': `Delete red flag ${f.type_name}, ${f.text}` }, on: { click: () => removeFlag(e, f) } }),
        ),
      ),
    );
    flagList.replaceChildren(el('thead', {}, head), el('tbody', {}, ...rows));
  }

  ed.exclude.node.title = 'This element shows on no strip and never counts as a conflict. Its own setting decides; the category only gives new elements a default.';

  const editor = el(
    'section',
    { class: 'el-panel', attrs: { 'aria-label': 'Element' } },
    ed.title,
    el('div', { class: 'el-row' }, ed.name.node, ed.boardId.node, ed.locked.node, ed.exclude.node),
    el('div', { class: 'el-row' }, el('span', { class: 'el-label', text: 'Day out of days' }), ed.holds.node, ed.drops.node, ed.gap.node),
    ed.props,
    el('div', { class: 'el-row el-notes' }, el('label', { class: 'el-label', attrs: { for: 'el-notes' }, text: 'Notes' }), ed.notes),
    el('div', { class: 'el-row' }, el('span', { class: 'el-label', text: 'Links to' }), ed.links, ed.linkedBy, el('span', { class: 'bd-spacer' }), ed.editLinks),
    el('div', { class: 'el-row' }, el('span', { class: 'el-label', text: 'Images' }), ed.images, el('span', { class: 'bd-spacer' }), ed.addImage),
    el('div', { class: 'el-row' }, el('label', { class: 'el-label', attrs: { for: 'el-move-to' }, text: 'Move to' }), ed.moveTo, ed.move, el('span', { class: 'bd-spacer' }), ed.newEvent, ed.del),
    el('div', { class: 'el-row rf-head' }, el('h3', { text: 'Red flags' }), el('span', { class: 'bd-spacer' }), addFlag, typesBtn),
    flagList,
    el('div', { class: 'el-row rf-head' }, el('h3', { attrs: { id: 'el-days-title' }, text: 'Days and dates' })),
    ed.daysNote,
    ed.days,
  );

  const main = el('div', { class: 'el-main' }, error, catPanel, listPanel, editor);
  host.replaceChildren(el('div', { class: 'el-tab' }, side, main));

  // ---- Drawing

  function drawCategories() {
    catList.replaceChildren(
      ...dto.categories.map((c) =>
        el(
          'li',
          {},
          el(
            'button',
            {
              class: c.id === dto.category ? 'el-cat current' : 'el-cat',
              attrs: { type: 'button', 'aria-current': c.id === dto.category ? 'true' : false },
              on: { click: () => c.id !== dto.category && actions.show(c.id) },
            },
            el('span', { text: c.name }),
            el('span', { class: 'el-n', text: String(c.elements) }),
          ),
        ),
      ),
    );
    headList.replaceChildren(
      ...dto.headers.map((h) =>
        el(
          'li',
          {},
          el(
            'button',
            {
              class: h.key === dto.header ? 'el-cat current' : 'el-cat',
              title: `Every ${h.label.toLowerCase()} on the sheets, with its sheets, pages and days`,
              attrs: { type: 'button', 'aria-current': h.key === dto.header ? 'true' : false },
              on: { click: () => h.key !== dto.header && actions.showHeader(h.key) },
            },
            el('span', { text: h.label }),
            el('span', { class: 'el-n', text: String(h.values) }),
          ),
        ),
      ),
    );
  }

  function drawCategory() {
    const c = header() ? null : category();
    catPanel.hidden = !c;
    if (!c) return;
    cat.title.textContent = c.name;
    fill(cat.name.input, c.name);
    cat.builtIn.hidden = !c.built_in;
    cat.up.disabled = c.built_in || c.place === 0;
    cat.down.disabled = c.built_in || c.place + 1 >= c.user_count;
    cat.del.disabled = c.built_in || c.elements > 0;
    cat.del.title = c.built_in ? 'Built-in categories stay.' : c.elements > 0 ? 'Only an empty category can be deleted.' : '';
    fill(cat.auto.input, c.auto_board_id);
    fill(cat.exclude.input, c.exclude_from_board);
    fill(cat.daily.input, c.daily_quantity);
    drawProperties(c);
    fill(cat.holds.input, c.holds);
    fill(cat.drops.input, c.drops);
    fill(cat.gap.input, c.min_drop_gap);
    cat.apply.disabled = c.elements === 0;
  }

  const COLS = [
    ['ID', 'board_id', ''],
    ['Name', 'name', ''],
    ['Sheets', 'sheets', 'n'],
    ['Pages', 'pages', 'n'],
    ['Work days', 'days', 'n'],
    ['Start', 'start', ''],
    ['Finish', 'finish', ''],
    ['Events', 'events', 'n'],
    ['Conflicts', 'conflicts', 'n'],
    ['Red flags', 'clashes', 'n'],
  ];

  /** The rows in the order the table shows (logic.js: ties keep the engine's order, blanks last). */
  function sorted() {
    return sortRows(dto.elements, sortKey, sortDown);
  }

  function sortBy(key) {
    ({ key: sortKey, down: sortDown } = nextSort(sortKey, sortDown, key));
    drawList();
  }

  function drawList() {
    const h = header();
    const n = dto.elements.length;
    const noun = h ? h.label.toLowerCase() : 'element';
    count.textContent = n === 1 ? `1 ${noun}` : `${n} ${noun}s`;
    for (const id of [...ticked]) if (!dto.elements.some((e) => e.id === id)) ticked.delete(id);
    mergeBtn.disabled = ticked.size < 2;
    mergeBtn.title = 'Tick two or more elements to merge them';
    renumberBtn.disabled = n === 0;
    renumberBtn.hidden = mergeBtn.hidden = Boolean(h);
    note.textContent = dto.dates_note || (h ? `${h.label}: each value on the sheets, worked out from them, with work days on ${dto.sub_board}. Change a value on its breakdown sheets.` : `Work days and dates are on ${dto.sub_board}.`);
    if (!n) {
      const why = h ? `No sheet has a ${noun} yet.` : 'No elements in this category yet. Add them on a breakdown sheet.';
      table.replaceChildren(el('tbody', {}, el('tr', {}, el('td', { class: 'empty', text: why }))));
      return;
    }
    const cols = h ? COLS.filter(([, key]) => key !== 'board_id' && key !== 'events' && key !== 'conflicts' && key !== 'clashes') : COLS;
    const head = el(
      'tr',
      {},
      h ? null : el('th', { attrs: { scope: 'col' } }, el('span', { class: 'visually-hidden', text: 'Merge' })),
      ...cols.map(([label, key, cls]) => {
        const on = sortKey === key;
        return el(
          'th',
          { class: cls, attrs: { scope: 'col', 'aria-sort': on ? (sortDown ? 'descending' : 'ascending') : false } },
          el('button', { class: 'el-sort', text: on ? `${label} ${sortDown ? '▼' : '▲'}` : label, title: `Sort by ${label.toLowerCase()}`, attrs: { type: 'button' }, on: { click: () => sortBy(key) } }),
        );
      }),
    );
    if (h) {
      const rows = sorted().map((e) =>
        el('tr', {}, ...cols.map(([, key, cls]) => el('td', { class: cls, text: e[key] === null || e[key] === undefined ? '' : e[key] }))),
      );
      table.replaceChildren(el('thead', {}, head), el('tbody', {}, ...rows));
      return;
    }
    const rows = sorted().map((e) => {
      const tick = el('input', { attrs: { type: 'checkbox', checked: ticked.has(e.id), 'aria-label': `Merge ${e.name}` } });
      tick.addEventListener('change', () => {
        if (tick.checked) ticked.add(e.id);
        else ticked.delete(e.id);
        mergeBtn.disabled = ticked.size < 2;
      });
      const cells = COLS.map(([, key, cls]) => {
        if (key === 'name') {
          return el(
            'td',
            {},
            el('button', { class: 'el-pick', text: e.name, attrs: { type: 'button', 'aria-pressed': e.id === selected ? 'true' : 'false' }, on: { click: () => pick(e.id) } }),
          );
        }
        if (key === 'board_id') return el('td', { class: 'el-id', text: e.locked ? `${e.board_id} (locked)` : e.board_id });
        if (key === 'conflicts' && e.conflicts > 0) return el('td', { class: `${cls} el-conflict`, text: e.conflicts, title: e.conflicts === 1 ? '1 conflict on this sub-board: see the Conflicts tab' : `${e.conflicts} conflicts on this sub-board: see the Conflicts tab` });
        // Red flag clashes on the sub-board (decisions.md, entry 84).
        if (key === 'clashes') {
          const n = e.clashes || 0;
          return n
            ? el('td', { class: `${cls} el-conflict`, title: n === 1 ? '1 red flag clash on this sub-board: see the Red flags tab' : `${n} red flag clashes on this sub-board: see the Red flags tab` }, el('span', { class: 'rf-mark', text: '⚑', attrs: { 'aria-hidden': 'true' } }), String(n))
            : el('td', { class: cls, text: '' });
        }
        const v = e[key];
        return el('td', { class: cls, text: v === null || v === undefined ? '' : v });
      });
      return el('tr', { class: e.id === selected ? 'selected' : '', data: { id: e.id }, on: { click: (ev) => !ev.target.closest('input, button') && pick(e.id) } }, el('td', {}, tick), ...cells);
    });
    table.replaceChildren(el('thead', {}, head), el('tbody', {}, ...rows));
  }

  let editing = null;

  /** The element whose days and dates are drawn, and the one asked for last. */
  let daysFor = null;
  let daysAsked = 0;

  async function loadDays(e) {
    const ask = ++daysAsked;
    daysFor = e.id;
    ed.daysNote.textContent = '';
    try {
      const d = await actions.days(e.id);
      if (ask !== daysAsked) return;
      drawDays(d);
    } catch (err) {
      if (ask === daysAsked) {
        ed.days.replaceChildren();
        ed.daysNote.textContent = String(err);
      }
    }
  }

  function drawDays(d) {
    $title('el-days-title', `Days and dates on ${d.sub_board}`);
    if (d.empty) {
      ed.days.replaceChildren();
      ed.daysNote.textContent = d.empty;
      return;
    }
    const work = d.days.filter((x) => x.code && x.code !== 'H').length;
    ed.daysNote.textContent = `${d.days.length} dates from the first to the last; ${work} with a code that counts as work or an event.`;
    const head = el('tr', {}, ...['Date', 'Day', 'Shoot day', 'Code', 'What'].map((t) => el('th', { attrs: { scope: 'col' }, text: t })));
    const rows = d.days.map((x) => el('tr', {}, el('td', { text: showDate(x.date) }), el('td', { text: x.weekday }), el('td', { class: 'n', text: x.shoot_day === null ? '' : x.shoot_day }), el('td', { class: 'el-code', text: x.code }), el('td', { text: x.text })));
    ed.days.replaceChildren(el('thead', {}, head), el('tbody', {}, ...rows));
  }

  function $title(id, text) {
    const n = document.getElementById(id);
    if (n) n.textContent = text;
  }

  /** The element's property values, one field each (commits on change). */
  function drawPropertyValues(e) {
    const keep = document.activeElement && ed.props.contains(document.activeElement) ? document.activeElement.id : null;
    ed.props.hidden = !e.properties.length;
    ed.props.replaceChildren(
      ...e.properties.map((p, i) => {
        const id = `el-pv-${i}`;
        // A property of several lines gets a text area; Enter adds a line there.
        const input = p.multi_line
          ? el('textarea', { class: 'w-m', attrs: { id, rows: '2', 'aria-describedby': 'el-error' } })
          : el('input', { class: 'w-m', attrs: { id, type: 'text', value: p.value, autocomplete: 'off', 'aria-describedby': 'el-error' } });
        if (p.multi_line) input.value = p.value;
        input.addEventListener('change', () => {
          if (input.value !== p.value) attempt(() => actions.setProperty(e.id, p.name, input.value), input, `pv-${i}`);
        });
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' && !p.multi_line) input.dispatchEvent(new Event('change'));
        });
        return el('label', { class: 'bd-field', attrs: { for: id } }, el('span', { text: p.name }), input);
      }),
    );
    if (keep) {
      const again = document.getElementById(keep);
      if (again) again.focus({ preventScroll: true });
    }
  }

  /** The element's images: a thumbnail each (read by Rust from the stored path), its path, and Remove. */
  let imagesFor = '';
  function drawImages(e) {
    const key = `${e.id}:${e.images.join('\n')}`;
    if (key === imagesFor) return;
    imagesFor = key;
    ed.images.replaceChildren(
      ...(e.images.length
        ? e.images.map((path, i) => {
            const name = path.split(/[\\/]/).pop();
            const thumb = el('span', { class: 'el-thumb', text: 'Loading', attrs: { 'aria-hidden': 'true' } });
            actions.image(e.id, i).then(
              (url) => {
                if (url) showThumb(thumb, url, name);
                else {
                  thumb.textContent = 'Missing';
                  thumb.title = `No image file at ${path}`;
                }
              },
              () => (thumb.textContent = 'Missing'),
            );
            const remove = el('button', { class: 'btn btn-mini', text: '×', title: `Take ${name} off ${e.name} (the file stays)`, attrs: { type: 'button', 'aria-label': `Take image ${name} off` }, on: { click: () => attempt(() => actions.removeImage(e.id, i)) } });
            return el('span', { class: 'el-image', title: path, attrs: { role: 'listitem' } }, thumb, el('span', { class: 'el-image-name', text: name }), remove);
          })
        : [el('span', { class: 'bd-hint', text: 'None. The schedule keeps only where each image is; the files stay beside it.' })]),
    );
  }

  function drawEditor() {
    const e = elem();
    editor.hidden = !e || Boolean(header());
    if (!e || header()) return;
    if (editing !== e.id) {
      editing = e.id;
      for (const i of editor.querySelectorAll('input, textarea')) i.removeAttribute('aria-invalid');
      ed.name.input.value = '';
      ed.boardId.input.value = '';
      ed.gap.input.value = '';
      ed.notes.value = '';
    }
    ed.title.textContent = e.board_id ? `${e.board_id} ${e.name}` : e.name;
    fill(ed.name.input, e.name);
    fill(ed.boardId.input, e.board_id);
    fill(ed.locked.input, e.locked);
    fill(ed.exclude.input, e.exclude_from_board);
    fill(ed.holds.input, e.holds);
    fill(ed.drops.input, e.drops);
    fill(ed.gap.input, e.min_drop_gap);
    fill(ed.notes, e.notes);
    drawPropertyValues(e);
    ed.links.textContent = e.link_names.length ? e.link_names.join(', ') : 'nothing';
    ed.linkedBy.textContent = e.linked_by.length ? `Linked from ${e.linked_by.join(', ')}` : '';
    drawImages(e);
    loadDays(e);
    const others = dto.categories.filter((c) => c.id !== dto.category);
    const keep = ed.moveTo.value;
    ed.moveTo.replaceChildren(...others.map((c) => el('option', { text: c.name, attrs: { value: String(c.id) } })));
    if (others.some((c) => String(c.id) === keep)) ed.moveTo.value = keep;
    ed.moveTo.disabled = ed.move.disabled = others.length === 0;
    drawFlags(e);
  }

  function pick(id) {
    selected = id;
    clearError();
    drawList();
    drawEditor();
    ed.name.input.focus({ preventScroll: true });
  }

  function render(next) {
    const changedCategory = !dto || !next || dto.category !== next.category || dto.header !== next.header;
    dto = next;
    if (!dto) return;
    if (changedCategory) {
      ticked.clear();
      selected = null;
      editing = null;
      sortKey = null;
      sortDown = false;
      clearError();
      for (const i of catPanel.querySelectorAll('input')) {
        i.removeAttribute('aria-invalid');
        if (i.type === 'text') i.value = '';
      }
    }
    if (selected !== null && !dto.elements.some((e) => e.id === selected)) selected = null;
    drawCategories();
    drawCategory();
    drawList();
    drawEditor();
  }

  /** Shows element `id` (of the category shown) as if picked; focuses its name with `focus`. */
  function select(id, focus = true) {
    if (!dto || !dto.elements.some((e) => e.id === id)) return;
    selected = id;
    clearError();
    drawList();
    drawEditor();
    const row = host.querySelector(`tr[data-id="${Number(id)}"]`);
    if (row && typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' });
    if (focus) ed.name.input.focus({ preventScroll: true });
  }

  /** Focuses the category shown's name (a Find result on a category name). */
  function focusCategory(focus = true) {
    const input = host.querySelector('#el-cat-name');
    if (input && focus) input.focus();
  }

  return {
    render,
    current: () => dto,
    select,
    focusCategory,
    /** Edit > Linked Elements (mod+l): the links editor for the element picked. False when none is. */
    editLinks() {
      if (!elem()) return false;
      ed.editLinks.click();
      return true;
    },
    /** Edit > Add Red Flag (mod+k): the red flag dialog for the element picked. False when none is. */
    addRedFlag() {
      if (!elem()) return false;
      addFlag.click();
      return true;
    },
  };
}
