// Boards and sub-boards: the bar under the tabs that picks the board shown and the
// sub-board the Elements, Day out of days, Calendar and Reports tabs use; the Boards and
// Sub-boards dialog (add, rename, reorder, duplicate and delete them); and the Banner and
// Sort Strips dialogs. Every change is a command that main.js runs and draws (src/app.rs,
// src/board.rs). Text goes in through textContent and input values only (dom.js).

import { el } from './dom.js';
import { customDialog, errorLine } from './modal.js';
import { TEXT_SIZES } from './strips.js';
import { BANNER_FONTS, BANNER_PALETTE, bannerHex, nameToSend } from './logic.js';
import { bannerHexClass } from './board.js';

/** The fields Sort Strips offers, as the engine names them (SortField::name). */
export const SORT_FIELDS = [
  ['scene', 'Scene'],
  ['int_ext', 'I/E'],
  ['set', 'Set'],
  ['time_of_day', 'Time of day'],
  ['location', 'Location'],
  ['pages', 'Pages'],
  ['script_day', 'Script day'],
  ['unit', 'Unit'],
  ['sequence', 'Sequence'],
  ['episode', 'Episode'],
];

/**
 * Builds the bar in `host`. `actions` has showBoard(id), pickSub(id) and manage().
 * Returns { render(view, subId) }.
 */
export function createBoardsBar(host, actions) {
  const boardPick = el('select', { attrs: { id: 'pick-board', 'aria-label': 'Board shown' } });
  const subPick = el('select', { attrs: { id: 'pick-sub', 'aria-label': 'Sub-board for the Elements, Day out of days, Calendar and Reports tabs' } });
  boardPick.addEventListener('change', () => actions.showBoard(Number(boardPick.value)));
  subPick.addEventListener('change', () => actions.pickSub(Number(subPick.value)));
  const manage = el('button', { class: 'btn', text: 'Boards…', attrs: { type: 'button', id: 'btn-boards' }, on: { click: () => actions.manage() } });
  host.replaceChildren(
    el('label', { class: 'field' }, 'Board', boardPick),
    el('label', { class: 'field' }, 'Sub-board', subPick),
    manage,
  );

  const fill = (select, items, value) => {
    select.replaceChildren(...items.map((x) => el('option', { text: x.name, attrs: { value: String(x.id), selected: x.id === value } })));
    select.value = String(value);
  };

  return {
    render(view, subId) {
      fill(boardPick, view.boards, view.board.id);
      fill(subPick, view.board.sub_boards, subId);
    },
  };
}

/** A name not yet among `names` (ignoring case): `base`, else `base 2`, `base 3` and so on. */
export function freeName(base, names) {
  const taken = new Set(names.map((n) => n.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
}

/**
 * The Boards and Sub-boards dialog. `ctx.view()` is the latest view; every edit in `ctx`
 * (addBoard(name), duplicateBoard(id, name), renameBoard(id, name), moveBoard(id, to),
 * deleteBoard(id), showBoard(id), addSub(board, name), renameSub(id, name),
 * moveSub(id, to), deleteSub(id)) resolves with the new view or rejects with the
 * sentence to show. `focus` is `board` or `sub` to start in the matching New field.
 */
export function manageBoards(ctx, focus = null) {
  return customDialog((close, later) => {
    const error = errorLine();
    const body = el('div', { class: 'mb-body' });
    let armed = null;
    // A redraw waits while the pointer is down in the dialog (`later`, decisions.md,
    // entries 151 and 170): a name committed as the pointer leaves its field would
    // otherwise replace the button being clicked between the press and the click.

    const run = async (pending, keepFocus) => {
      try {
        await pending;
        error.hidden = true;
      } catch (e) {
        error.textContent = String(e);
        error.hidden = false;
      }
      later(() => draw(keepFocus));
    };

    const nameInput = (value, label, commit, key) => {
      const input = el('input', { class: 'mb-name', attrs: { type: 'text', value, 'aria-label': label, maxlength: '200', 'data-focus': key } });
      // Each name goes once: Return sends it, and the change that follows (on leaving the
      // field, or when a redraw takes the field away) does not send it again.
      let sent = null;
      const done = () => {
        if (!input.isConnected) return;
        const name = nameToSend(value, sent, input.value);
        if (name === null) return;
        sent = name;
        commit(name);
      };
      input.addEventListener('change', done);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          done();
        }
      });
      return input;
    };

    /** A Delete button that asks with a second click. */
    const deleteButton = (key, label, act) =>
      el('button', {
        class: armed === key ? 'btn btn-danger' : 'btn',
        text: armed === key ? 'Click again to delete' : 'Delete',
        attrs: { type: 'button', 'aria-label': armed === key ? `Confirm deleting ${label}` : `Delete ${label}`, 'data-focus': `del-${key}` },
        on: {
          click: () => {
            if (armed === key) {
              armed = null;
              run(act());
            } else {
              armed = key;
              draw(`del-${key}`);
            }
          },
        },
      });

    const moveButtons = (key, label, at, count, move) => [
      el('button', { class: 'btn', text: 'Up', attrs: { type: 'button', disabled: at === 0, 'aria-label': `Move ${label} up`, 'data-focus': `up-${key}` }, on: { click: () => run(move(at - 1), `up-${key}`) } }),
      el('button', { class: 'btn', text: 'Down', attrs: { type: 'button', disabled: at === count - 1, 'aria-label': `Move ${label} down`, 'data-focus': `down-${key}` }, on: { click: () => run(move(at + 1), `down-${key}`) } }),
    ];

    function draw(focusKey) {
      // Focus stays where it was in the dialog (the renamed field, say), so Escape and Tab
      // still reach it after the redraw.
      const had = document.activeElement;
      const keep = focusKey || (had && body.contains(had) ? had.dataset.focus || had.id || null : null);
      const view = ctx.view();
      const shown = view.board;
      const boards = view.boards.map((b, i) =>
        el(
          'li',
          { class: `mb-item${b.id === shown.id ? ' shown' : ''}` },
          nameInput(b.name, `Name of board ${b.name}`, (name) => run(ctx.renameBoard(b.id, name)), `name-b${b.id}`),
          el('span', { class: 'mb-actions' },
            b.id === shown.id
              ? el('span', { class: 'mb-shown', text: 'Shown' })
              : el('button', { class: 'btn', text: 'Show', attrs: { type: 'button', 'aria-label': `Show ${b.name}` }, on: { click: () => run(ctx.showBoard(b.id)) } }),
            ...moveButtons(`b${b.id}`, b.name, i, view.boards.length, (to) => ctx.moveBoard(b.id, to)),
            el('button', {
              class: 'btn',
              text: 'Duplicate',
              attrs: { type: 'button', 'aria-label': `Duplicate ${b.name}` },
              on: { click: () => run(ctx.duplicateBoard(b.id, freeName(`${b.name} copy`, view.boards.map((x) => x.name)))) },
            }),
            view.boards.length > 1 ? deleteButton(`b${b.id}`, b.name, () => ctx.deleteBoard(b.id)) : null,
          ),
        ),
      );
      const subs = shown.sub_boards.map((sb, i) =>
        el(
          'li',
          { class: 'mb-item' },
          nameInput(sb.name, `Name of sub-board ${sb.name}`, (name) => run(ctx.renameSub(sb.id, name)), `name-s${sb.id}`),
          el('span', { class: 'mb-actions' },
            ...moveButtons(`s${sb.id}`, sb.name, i, shown.sub_boards.length, (to) => ctx.moveSub(sb.id, to)),
            shown.sub_boards.length > 1 ? deleteButton(`s${sb.id}`, sb.name, () => ctx.deleteSub(sb.id)) : null,
          ),
        ),
      );
      const newBoard = el('input', { attrs: { type: 'text', 'aria-label': 'New board name', placeholder: 'New board name', id: 'mb-new-board', maxlength: '200' } });
      const addBoard = () => run(ctx.addBoard(newBoard.value), 'mb-new-board');
      newBoard.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addBoard();
        }
      });
      const newSub = el('input', { attrs: { type: 'text', 'aria-label': 'New sub-board name', placeholder: 'New sub-board name', id: 'mb-new-sub', maxlength: '200' } });
      const addSub = () => run(ctx.addSub(shown.id, newSub.value), 'mb-new-sub');
      newSub.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addSub();
        }
      });
      body.replaceChildren(
        el('h3', { class: 'mb-head', text: 'Boards' }),
        el('p', { class: 'modal-message', text: 'Each board is its own arrangement of every scene. Deleting a board keeps the scenes on the others.' }),
        el('ul', { class: 'mb-list', attrs: { 'aria-label': 'Boards' } }, ...boards),
        el('div', { class: 'mb-new' }, newBoard, el('button', { class: 'btn', text: 'Add Board', attrs: { type: 'button' }, on: { click: addBoard } })),
        el('h3', { class: 'mb-head', text: `Sub-boards of ${shown.name}` }),
        el('p', { class: 'modal-message', text: "Deleting a sub-board moves its scenes to the Boneyard; its day breaks, banners and calendar go with it. Each sub-board's start date is set on the Board tab." }),
        el('ul', { class: 'mb-list', attrs: { 'aria-label': 'Sub-boards' } }, ...subs),
        el('div', { class: 'mb-new' }, newSub, el('button', { class: 'btn', text: 'Add Sub-board', attrs: { type: 'button' }, on: { click: addSub } })),
      );
      const target = keep ? body.querySelector(`#${keep}, [data-focus="${keep}"]`) : null;
      if (target && !target.disabled) target.focus();
    }

    draw(null);
    const box = el(
      'div',
      { class: 'modal modal-wide', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mb-title' } },
      el('h2', { class: 'modal-title', text: 'Boards and Sub-boards', attrs: { id: 'mb-title' } }),
      error,
      body,
      el('div', { class: 'modal-actions' }, el('button', { class: 'btn btn-primary', text: 'Done', attrs: { type: 'button', 'data-autofocus': focus ? null : true }, on: { click: () => close(true) } })),
    );
    if (focus) {
      const field = body.querySelector(focus === 'sub' ? '#mb-new-sub' : '#mb-new-board');
      if (field) field.setAttribute('data-autofocus', '');
    }
    return box;
  });
}

/**
 * The banner dialog: text and a duration (h:mm). `submit({ text, duration })` resolves
 * when Rust took it, or rejects with the sentence to show in the dialog. `remove()`, when
 * given, adds a Delete Banner button. Resolves true when saved or deleted.
 */
/**
 * Board > Day Breaks: what the board's day breaks show (decisions.md, entry 67), from its
 * own settings or a named day break layout, and its shoot day strip: none, the day and
 * date, or a named shoot day layout with its text (entry 78).
 *
 * opts: { board (name), own (the board's own day look), uses ({ day_breaks, shoot_day }:
 * named layouts' ids or null), dayLayouts and shootLayouts ([{ id, name, look }]),
 * save({ dayTarget, look, shoot, shootText }), saveAs(kind, name, look) }. `dayTarget` is
 * 'own' or a day break layout's id; `shoot` is 'none', 'own' or a shoot day layout's id.
 * Each returns a promise that rejects with a sentence. Resolves true when saved.
 */
export function dayLookDialog({ board, own, uses = {}, dayLayouts = [], shootLayouts = [], save, saveAs }) {
  return customDialog((close) => {
    const error = errorLine();
    const fail = (e) => {
      error.textContent = String(e);
      error.hidden = false;
    };
    const box = (id, label) => {
      const b = el('input', { attrs: { type: 'checkbox', id } });
      return { b, node: el('label', { class: 'bd-check', attrs: { for: id } }, b, label) };
    };
    const screen = box('dl-screen', "The day's screen time");
    const rise = box('dl-rise', 'The earliest sunrise of its scenes');
    const set = box('dl-set', 'The latest sunset of its scenes');
    const qty = box('dl-qty', "The day's element quantities (categories that use daily quantities)");
    const text = el('input', { class: 'w-l', attrs: { type: 'text', id: 'dl-text', maxlength: '200', placeholder: 'None' } });
    let dayTarget = uses.day_breaks !== null && uses.day_breaks !== undefined && dayLayouts.some((l) => l.id === uses.day_breaks) ? uses.day_breaks : 'own';
    const lookOf = (t) => (t === 'own' ? own : (dayLayouts.find((l) => l.id === t) || { look: own }).look) || {};
    const fill = () => {
      const l = lookOf(dayTarget);
      screen.b.checked = Boolean(l.screen_time);
      rise.b.checked = Boolean(l.sunrise);
      set.b.checked = Boolean(l.sunset);
      qty.b.checked = Boolean(l.quantity);
      text.value = l.text || '';
    };
    fill();
    const daySel = el(
      'select',
      { attrs: { id: 'dl-layout', 'aria-label': 'The day break layout this board uses' } },
      el('option', { text: "This board's own", attrs: { value: 'own' } }),
      ...dayLayouts.map((l) => el('option', { text: l.name, attrs: { value: String(l.id), selected: l.id === dayTarget } })),
    );
    daySel.addEventListener('change', () => {
      dayTarget = daySel.value === 'own' ? 'own' : Number(daySel.value);
      fill();
    });
    // The shoot day strip: none, the day and date, or a named shoot day layout.
    const shootStart = uses.shoot_day !== null && uses.shoot_day !== undefined && shootLayouts.some((l) => l.id === uses.shoot_day) ? String(uses.shoot_day) : own.shoot_day_strip ? 'own' : 'none';
    const shootSel = el(
      'select',
      { attrs: { id: 'dl-shoot', 'aria-label': 'The shoot day strip above each day break' } },
      el('option', { text: 'None', attrs: { value: 'none', selected: shootStart === 'none' } }),
      el('option', { text: 'Day of days and full date', attrs: { value: 'own', selected: shootStart === 'own' } }),
      ...shootLayouts.map((l) => el('option', { text: l.name, attrs: { value: String(l.id), selected: shootStart === String(l.id) } })),
    );
    const shootText = el('input', { class: 'w-l', attrs: { type: 'text', id: 'dl-shoot-text', maxlength: '200', placeholder: 'None' } });
    const shootFill = () => {
      const named = shootLayouts.find((l) => String(l.id) === shootSel.value);
      shootText.value = named ? (named.look && named.look.text) || '' : '';
      shootText.disabled = !named;
    };
    shootSel.addEventListener('change', shootFill);
    shootFill();
    const look = () => ({ screen_time: screen.b.checked, sunrise: rise.b.checked, sunset: set.b.checked, quantity: qty.b.checked, text: text.value });
    const go = async () => {
      const shoot = shootSel.value === 'none' || shootSel.value === 'own' ? shootSel.value : Number(shootSel.value);
      try {
        await save({ dayTarget, look: look(), shoot, shootText: shootText.value });
        close(true);
      } catch (e) {
        fail(e);
      }
    };
    text.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        go();
      }
    });
    const newName = el('input', { class: 'w-m', attrs: { type: 'text', id: 'dl-new-name', placeholder: 'Name', maxlength: '200', 'aria-label': 'Name of a new named layout' } });
    const asNew = (kind) => async () => {
      try {
        await saveAs(kind, newName.value, kind === 'shoot_day' ? { screen_time: false, sunrise: false, sunset: false, quantity: false, text: shootText.disabled ? '' : shootText.value } : look());
        close(true);
      } catch (e) {
        fail(e);
      }
    };
    return el(
      'div',
      { class: 'modal modal-wide', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dl-title' } },
      el('h2', { class: 'modal-title', text: `Day Breaks on ${board}`, attrs: { id: 'dl-title' } }),
      el('p', { class: 'modal-message', text: "Every day break shows its day, scenes, pages and shoot time. It can show these too, on this board and its printout. A named layout changes on every board that uses it." }),
      error,
      el('div', { class: 'ly-pick' }, el('label', { class: 'bd-field beside', attrs: { for: 'dl-layout' } }, el('span', { text: 'Day break layout' }), daySel)),
      el('div', { class: 'show-boxes' }, screen.node, rise.node, set.node, qty.node, el('label', { class: 'bd-field beside', attrs: { for: 'dl-text' } }, el('span', { text: 'Text' }), text)),
      el(
        'div',
        { class: 'ly-pick' },
        el('label', { class: 'bd-field beside', attrs: { for: 'dl-shoot' } }, el('span', { text: 'Shoot day strip' }), shootSel),
        el('label', { class: 'bd-field beside', attrs: { for: 'dl-shoot-text' } }, el('span', { text: 'Its text' }), shootText),
      ),
      el(
        'div',
        { class: 'ly-pick' },
        newName,
        el('button', { class: 'btn', text: 'Save as Day Break Layout', attrs: { type: 'button' }, on: { click: asNew('day_breaks') } }),
        el('button', { class: 'btn', text: 'Save as Shoot Day Layout', attrs: { type: 'button' }, on: { click: asNew('shoot_day') } }),
      ),
      el(
        'div',
        { class: 'modal-actions' },
        el('button', { class: 'btn', text: 'Cancel', attrs: { type: 'button' }, on: { click: () => close(null) } }),
        el('button', { class: 'btn btn-primary', text: 'Save', attrs: { type: 'button', 'data-autofocus': true }, on: { click: go } }),
      ),
    );
  });
}

/** The banner palette (src: model::BannerColor), in its order, with the names the dialog shows. */
export const BANNER_COLORS = [
  ['yellow', 'Yellow'],
  ['orange', 'Orange'],
  ['red', 'Red'],
  ['pink', 'Pink'],
  ['purple', 'Purple'],
  ['blue', 'Blue'],
  ['teal', 'Teal'],
  ['green', 'Green'],
  ['gray', 'Gray'],
];

export function bannerDialog({ title, text = '', duration = '', style = {}, confirmText, submit, remove = null }) {
  return customDialog((close) => {
    const error = errorLine();
    const textInput = el('input', { class: 'w-l', attrs: { type: 'text', value: text, id: 'banner-text', maxlength: '200', 'data-autofocus': true } });
    const timeInput = el('input', { class: 'w-xs', attrs: { type: 'text', value: duration && duration !== '0:00' ? duration : '', id: 'banner-time', placeholder: '0:00' } });
    // Its look (decisions.md, entries 65 and 87): bold, a palette color, one or two lines high.
    const bold = el('input', { attrs: { type: 'checkbox', id: 'banner-bold', checked: Boolean(style.bold) } });
    // The palette (decision 154): the board's own, the nine named colors (lighter or
    // darker with the theme), forty more by value, and any other color.
    let picked = style.color || '';
    const swatches = [];
    const swatch = (value, label, cls) => {
      const b = el('button', { class: `bn-swatch${cls}`, title: label, attrs: { type: 'button', role: 'radio', 'aria-label': label, 'aria-checked': String(picked === value) }, on: { click: () => pick(value) } });
      swatches.push({ value, b });
      return b;
    };
    const custom = el('input', { attrs: { type: 'color', id: 'banner-custom', value: bannerHex(picked) || '#ffffff', 'aria-label': 'Another color' } });
    const pick = (value) => {
      picked = value;
      for (const s of swatches) s.b.setAttribute('aria-checked', String(s.value === value));
      if (bannerHex(value)) custom.value = value;
    };
    custom.addEventListener('input', () => pick(custom.value.toLowerCase()));
    const color = el(
      'div',
      { class: 'bn-palette', attrs: { role: 'radiogroup', 'aria-label': 'Banner color' } },
      swatch('', "The board's banner color", ' bn-none'),
      ...BANNER_COLORS.map(([v, label]) => swatch(v, label, ` bc-${v}`)),
      ...BANNER_PALETTE.map((hex) => swatch(hex, hex, bannerHexClass(hex))),
      custom,
    );
    const height = el(
      'select',
      { attrs: { id: 'banner-height' } },
      el('option', { text: 'One line', attrs: { value: '1' } }),
      el('option', { text: 'Two lines', attrs: { value: '2', selected: Boolean(style.tall) } }),
    );
    // Its text size step and where the text sits (decisions.md, entry 87): fixed choices.
    const size = el('select', { attrs: { id: 'banner-size' } }, ...TEXT_SIZES.map(([v, label]) => el('option', { text: label, attrs: { value: v, selected: (style.size || 'normal') === v } })));
    const align = el(
      'select',
      { attrs: { id: 'banner-align' } },
      ...[
        ['left', 'Left'],
        ['center', 'Center'],
        ['right', 'Right'],
      ].map(([v, label]) => el('option', { text: label, attrs: { value: v, selected: (style.align || 'left') === v } })),
    );
    // Its font family (decisions.md, entry 187): the board's or one of a few every system has.
    const font = el('select', { attrs: { id: 'banner-font' } }, ...BANNER_FONTS.map(([v, label]) => el('option', { text: label, attrs: { value: v, selected: (style.font || 'usual') === v } })));
    const save = async () => {
      try {
        await submit({ text: textInput.value, duration: timeInput.value, style: { bold: bold.checked, color: picked || null, tall: height.value === '2', size: size.value, align: align.value, font: font.value } });
        close(true);
      } catch (e) {
        error.textContent = String(e);
        error.hidden = false;
      }
    };
    const form = el(
      'form',
      { class: 'bn-form' },
      el('label', { class: 'bd-field beside' }, 'Text', textInput),
      el('label', { class: 'bd-field beside' }, 'Duration (h:mm)', timeInput),
      el('div', { class: 'bd-field beside' }, el('span', { text: 'Color' }), color),
      el('label', { class: 'bd-field beside' }, 'Height', height),
      el('label', { class: 'bd-field beside' }, 'Text size', size),
      el('label', { class: 'bd-field beside' }, 'Alignment', align),
      el('label', { class: 'bd-field beside' }, 'Font', font),
      el('label', { class: 'bd-check', attrs: { for: 'banner-bold' } }, bold, 'Bold'),
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      save();
    });
    for (const input of [textInput, timeInput]) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          save();
        }
      });
    }
    const actions = [el('button', { class: 'btn', text: 'Cancel', attrs: { type: 'button' }, on: { click: () => close(null) } })];
    if (remove) {
      actions.unshift(
        el('button', {
          class: 'btn btn-danger bn-delete',
          text: 'Delete Banner',
          attrs: { type: 'button' },
          on: {
            click: async () => {
              try {
                await remove();
                close(true);
              } catch (e) {
                error.textContent = String(e);
                error.hidden = false;
              }
            },
          },
        }),
      );
    }
    actions.push(el('button', { class: 'btn btn-primary', text: confirmText, attrs: { type: 'button', id: 'banner-ok' }, on: { click: save } }));
    return el(
      'div',
      { class: 'modal', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'banner-title' } },
      el('h2', { class: 'modal-title', text: title, attrs: { id: 'banner-title' } }),
      el('p', { class: 'modal-message', text: "The duration counts toward the day's shoot time." }),
      error,
      form,
      el('div', { class: 'modal-actions' }, ...actions),
    );
  });
}

let lastKeys = [{ field: 'scene', descending: false }];

/**
 * The Sort Strips dialog for list `name`: up to four fields (decision 122), each
 * ascending or descending. `submit(keys)` resolves when Rust sorted, or rejects with the sentence to
 * show. Resolves true when sorted.
 */
export function sortDialog({ name, submit }) {
  return customDialog((close) => {
    const error = errorLine();
    const rows = [0, 1, 2, 3].map((i) => {
      const k = lastKeys[i] || null;
      const field = el(
        'select',
        { attrs: { id: `sort-field-${i}`, 'aria-label': `${['First', 'Then', 'Then', 'Then'][i]} sort field` } },
        i > 0 ? el('option', { text: 'None', attrs: { value: '' } }) : null,
        ...SORT_FIELDS.map(([v, label]) => el('option', { text: label, attrs: { value: v, selected: k && k.field === v } })),
      );
      if (!k && i > 0) field.value = '';
      const way = el(
        'select',
        { attrs: { id: `sort-way-${i}`, 'aria-label': `${['First', 'Then', 'Then', 'Then'][i]} sort order` } },
        el('option', { text: 'Ascending', attrs: { value: 'asc', selected: !(k && k.descending) } }),
        el('option', { text: 'Descending', attrs: { value: 'desc', selected: Boolean(k && k.descending) } }),
      );
      return { field, way, node: el('div', { class: 'sort-row' }, el('span', { class: 'sort-label', text: i === 0 ? 'Sort by' : 'Then by' }), field, way) };
    });
    const go = async () => {
      const keys = rows.filter((r) => r.field.value).map((r) => ({ field: r.field.value, descending: r.way.value === 'desc' }));
      try {
        await submit(keys);
        lastKeys = keys;
        close(true);
      } catch (e) {
        error.textContent = String(e);
        error.hidden = false;
      }
    };
    return el(
      'div',
      { class: 'modal', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sort-title' } },
      el('h2', { class: 'modal-title', text: `Sort ${name}`, attrs: { id: 'sort-title' } }),
      el('p', { class: 'modal-message', text: 'Banners go to the top and day breaks are removed, so break the days again after sorting. Scenes with a field left empty come last. Undo puts it all back.' }),
      error,
      el('div', { class: 'sort-rows' }, ...rows.map((r) => r.node)),
      el(
        'div',
        { class: 'modal-actions' },
        el('button', { class: 'btn', text: 'Cancel', attrs: { type: 'button' }, on: { click: () => close(null) } }),
        el('button', { class: 'btn btn-primary', text: 'Sort', attrs: { type: 'button', id: 'sort-ok', 'data-autofocus': true }, on: { click: go } }),
      ),
    );
  });
}
