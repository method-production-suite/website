// Strip colors (decisions.md, entry 60): the Strip Colors dialog, and the stylesheet that
// paints the board's strips in the colors the user set.
//
// Colors travel as `#rrggbb` and are checked here against that pattern before they go
// into a constructed stylesheet (dynstyle.js), so no schedule text ever reaches CSS.

import { el } from './dom.js';
import { setRules } from './dynstyle.js';
import { customDialog, errorLine } from './modal.js';

const HEX = /^#[0-9a-f]{6}$/;

/** The usual convention's colors (styles.css, light), shown for a value with no color set. */
export const TONE_HEX = { 'int-day': '#ffffff', 'ext-day': '#fff4bf', 'int-night': '#d8e5fb', 'ext-night': '#d6efd6' };

const valid = (c) => (typeof c === 'string' && HEX.test(c.toLowerCase()) ? c.toLowerCase() : null);

/**
 * The class a scene strip with a user color gets (`sc-0`, `sc-1`...), from `palette`, a
 * Map of `bg|ink` to its index that the board fills as it draws.
 */
export function colorClass(strip, palette) {
  const bg = valid(strip.color);
  if (!bg) return '';
  const ink = valid(strip.ink) || '#000000';
  const key = `${bg}|${ink}`;
  if (!palette.has(key)) palette.set(key, palette.size);
  return ` sc-${palette.get(key)}`;
}

/**
 * Writes the color rules for strips under `scope` (the board, or the printed board with
 * `row` 'tr.bp' and `cells`, the table cells painted too): each palette entry, and the
 * text color per strip type.
 */
export function paintStrips(palette, colors, { scope = '#board', row = '.row', cells = false, name = null } = {}) {
  const sel = (cls, extra = '') => {
    const base = `${scope} ${row}${cls}`;
    return cells ? `${base}${extra}, ${base} td${extra}` : `${base}${extra}`;
  };
  let css = '';
  for (const [key, i] of palette) {
    const [bg, ink] = key.split('|');
    if (!valid(bg) || !valid(ink)) continue;
    css += `${sel(`.scene.sc-${i}`)} { background-color: ${bg}; color: ${ink}; }\n${scope} ${row}.scene.sc-${i} .fc-cast { color: ${ink}; }\n`;
  }
  const c = colors || {};
  const scene = valid(c.scene_text);
  const banner = valid(c.banner_text);
  const brk = valid(c.break_text);
  if (scene) css += `${sel('.scene')} { color: ${scene}; }\n${scope} ${row}.scene .fc-cast { color: ${scene}; }\n`;
  if (banner) css += `${sel('.banner')}, ${scope} ${row}.banner .banner-time { color: ${banner}; }\n`;
  if (brk) css += `${sel('.day-break:not(.parked)')} { color: ${brk}; }\n`;
  setRules(name || `strip-colors${scope === '#board' ? '' : '-print'}`, css);
}

const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
const shown = (v) => (v.trim() ? v.trim() : 'any');

/**
 * The Strip Colors dialog. `colors` is the view's (src/view.rs, ColorsDto); `combos` the
 * I/E and time of day pairs the board's scenes use, each with its usual `tone`.
 * `submit({ rules, scene_text, banner_text, break_text })` returns a promise that
 * rejects with a sentence. Resolves true when saved.
 */
export function stripColorsDialog({ colors, combos, submit }) {
  return customDialog((close) => {
    const error = errorLine();
    // Every row: { int_ext, time_of_day, tone, custom, input, node }.
    const rows = [];
    const list = el('div', { class: 'sc-rows', attrs: { role: 'list' } });

    const addRow = (int_ext, time_of_day, color, custom, tone, text = null) => {
      const usual = TONE_HEX[tone] || '#ffffff';
      const pair = `${shown(int_ext)} / ${shown(time_of_day)}`;
      const input = el('input', { attrs: { type: 'color', value: color || usual, 'aria-label': `Color of ${pair}` } });
      const state = el('span', { class: 'sc-state' });
      // The pair's own text color (decision 108): it wins over Scene text below. Setting
      // one keeps the pair's strip color too (the usual one unless changed).
      const inkOn = el('input', { attrs: { type: 'checkbox', checked: Boolean(text), 'aria-label': `${pair}: its own text color` } });
      const ink = el('input', { attrs: { type: 'color', value: text || '#000000', disabled: !text, 'aria-label': `Text color of ${pair}` } });
      const row = { int_ext, time_of_day, tone, custom, input, inkOn, ink };
      inkOn.addEventListener('change', () => {
        ink.disabled = !inkOn.checked;
        if (inkOn.checked) row.custom = true;
        mark();
      });
      const mark = () => {
        state.textContent = row.custom ? 'Set' : 'Usual';
        reset.disabled = !row.custom;
      };
      input.addEventListener('input', () => {
        row.custom = true;
        mark();
      });
      const reset = el('button', {
        class: 'btn',
        text: tone ? 'Usual' : 'Remove',
        attrs: { type: 'button', title: tone ? 'Back to the usual color' : 'Remove this color' },
        on: {
          click: () => {
            if (!tone) {
              rows.splice(rows.indexOf(row), 1);
              row.node.remove();
              return;
            }
            row.custom = false;
            input.value = usual;
            inkOn.checked = false;
            ink.disabled = true;
            mark();
          },
        },
      });
      row.node = el('div', { class: 'sc-row sc-rule', attrs: { role: 'listitem' } }, el('span', { class: 'sc-ie', text: shown(int_ext) }), el('span', { class: 'sc-tod', text: shown(time_of_day) }), input, el('label', { class: 'bd-check sc-ink', title: 'Its own text color, over Scene text' }, inkOn, 'Text'), ink, state, reset);
      mark();
      rows.push(row);
      list.append(row.node);
    };

    for (const r of colors.rules || []) {
      const combo = combos.find((c) => same(c.int_ext, r.int_ext) && same(c.time_of_day, r.time_of_day));
      addRow(r.int_ext, r.time_of_day, valid(r.color), true, combo ? combo.tone : null, valid(r.text));
    }
    for (const c of combos) {
      if (rows.some((r) => same(r.int_ext, c.int_ext) && same(r.time_of_day, c.time_of_day))) continue;
      addRow(c.int_ext, c.time_of_day, null, false, c.tone);
    }

    // A color for values no scene uses yet, or for any value (an empty field).
    const newIe = el('input', { class: 'short', attrs: { type: 'text', placeholder: 'any', 'aria-label': 'I/E for a new color (empty for any)' } });
    const newTod = el('input', { class: 'short', attrs: { type: 'text', placeholder: 'any', 'aria-label': 'Time of day for a new color (empty for any)' } });
    const newColor = el('input', { attrs: { type: 'color', value: '#ffcc88', 'aria-label': 'The new color' } });
    const add = el('button', {
      class: 'btn',
      text: 'Add',
      attrs: { type: 'button' },
      on: {
        click: () => {
          if (rows.some((r) => same(r.int_ext, newIe.value) && same(r.time_of_day, newTod.value))) {
            error.textContent = `${shown(newIe.value)} / ${shown(newTod.value)} already has a color.`;
            error.hidden = false;
            return;
          }
          error.hidden = true;
          addRow(newIe.value.trim(), newTod.value.trim(), valid(newColor.value), true, null);
          newIe.value = '';
          newTod.value = '';
        },
      },
    });

    const texts = [
      ['scene_text', 'Scene text'],
      ['banner_text', 'Banner text'],
      ['break_text', 'Day break text'],
    ].map(([key, label]) => {
      const set = valid(colors[key]);
      const auto = el('input', { attrs: { type: 'checkbox', checked: !set, 'aria-label': `${label}: automatic` } });
      const input = el('input', { attrs: { type: 'color', value: set || '#000000', disabled: !set, 'aria-label': `${label} color` } });
      auto.addEventListener('change', () => (input.disabled = auto.checked));
      return { key, auto, input, node: el('div', { class: 'sc-row' }, el('span', { class: 'sc-ie', text: label }), el('label', { class: 'bd-check' }, auto, 'Automatic'), input) };
    });

    const go = async () => {
      const out = {
        rules: rows.filter((r) => r.custom).map((r) => ({ int_ext: r.int_ext, time_of_day: r.time_of_day, color: r.input.value, text: r.inkOn.checked ? r.ink.value : null })),
      };
      for (const t of texts) out[t.key] = t.auto.checked ? null : t.input.value;
      try {
        await submit(out);
        close(true);
      } catch (e) {
        error.textContent = String(e);
        error.hidden = false;
      }
    };
    const usualAll = () => {
      for (const r of [...rows]) {
        if (!r.tone) {
          rows.splice(rows.indexOf(r), 1);
          r.node.remove();
        } else if (r.custom) r.node.querySelector('button').click();
      }
      for (const t of texts) {
        t.auto.checked = true;
        t.input.disabled = true;
      }
    };

    return el(
      'div',
      { class: 'modal modal-wide', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sc-title' } },
      el('h2', { class: 'modal-title', text: 'Strip Colors', attrs: { id: 'sc-title' } }),
      el('p', {
        class: 'modal-message',
        text: 'A color for each I/E and time of day the scenes use; the first that matches a strip wins, and values with no color keep the usual ones. Every board shows them. Text is black or white, whichever reads, unless a pair has its own text color or one is set below.',
      }),
      error,
      el('div', { class: 'sc-head sc-rule', attrs: { 'aria-hidden': 'true' } }, el('span', { text: 'I/E' }), el('span', { text: 'Time of day' }), el('span', { text: 'Color' }), el('span', { class: 'sc-wide', text: 'Its own text color' })),
      list,
      el('div', { class: 'sc-row sc-add' }, newIe, newTod, newColor, add),
      el('h3', { class: 'sc-sub', text: 'Text' }),
      ...texts.map((t) => t.node),
      el(
        'div',
        { class: 'modal-actions' },
        el('button', { class: 'btn', text: 'Usual Colors', attrs: { type: 'button', title: 'Every strip back to the usual colors' }, on: { click: usualAll } }),
        el('span', { class: 'bd-spacer' }),
        el('button', { class: 'btn', text: 'Cancel', attrs: { type: 'button' }, on: { click: () => close(null) } }),
        el('button', { class: 'btn btn-primary', text: 'Save', attrs: { type: 'button', 'data-autofocus': true }, on: { click: go } }),
      ),
    );
  });
}

/** The distinct I/E and time of day pairs of the board's scenes, in board order, with their usual tone. */
export function combosOf(board) {
  const out = [];
  const strips = board.sub_boards.flatMap((sb) => sb.days.flatMap((d) => d.strips).concat(sb.unscheduled)).concat(board.boneyard);
  for (const st of strips) {
    if (st.kind !== 'scene') continue;
    if (out.some((c) => same(c.int_ext, st.int_ext) && same(c.time_of_day, st.time_of_day))) continue;
    out.push({ int_ext: st.int_ext.trim(), time_of_day: st.time_of_day.trim(), tone: st.tone });
  }
  return out;
}
