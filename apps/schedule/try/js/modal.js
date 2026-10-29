// In-page dialogs, one at a time: a question with buttons, or any content built by the
// caller. Escape and a click outside cancel. The page behind is inert while one is open.
// Text goes in through textContent only (dom.js).

import { el, $ } from './dom.js';
import { dialogEscape, pressGate } from './logic.js';

let open = null;
let behind = [];

export function isModalOpen() {
  return open !== null;
}

function shutBehind() {
  const root = $('modal-root');
  behind = [...document.body.querySelectorAll('.app')].filter((n) => !n.inert && !n.contains(root));
  for (const n of behind) n.inert = true;
}

function openBehind() {
  for (const n of behind) n.inert = false;
  behind = [];
}

/**
 * Shows a dialog. `build(close, later)` returns its box (an element with role dialog);
 * call `close(result)` to dismiss it. Resolves with the result (null when cancelled).
 *
 * `later(f)` is how a dialog redraws itself after an edit (decisions.md, entries 151 and
 * 170): it runs `f` at once, or, while the pointer is down in the dialog, just after the
 * click (the last one only). A field that commits when it loses focus does so on the
 * press of the next button; a redraw then would move or replace that button under the
 * pointer and the click would be lost.
 */
export function customDialog(build) {
  if (open) open.close(null);
  return new Promise((resolve) => {
    const root = $('modal-root');
    const previous = document.activeElement;
    let backdrop = null;
    // Escape closes every dialog wherever focus is (decisions.md, entries 151 and 164):
    // a redraw inside a dialog, or a click on plain text in it, leaves focus on the page's
    // body, outside the backdrop, so the document listens. A list or menu inside the
    // dialog that takes Escape first stops it.
    const onEscape = (e) => {
      if (!backdrop || !dialogEscape(e)) return;
      e.preventDefault();
      e.stopPropagation();
      close(null);
    };
    const close = (result = null) => {
      if (!backdrop) return;
      document.removeEventListener('keydown', onEscape);
      backdrop.remove();
      backdrop = null;
      open = null;
      openBehind();
      if (previous && previous.focus) previous.focus({ preventScroll: true });
      resolve(result);
    };
    const gate = pressGate();
    const box = build(close, gate.run);
    backdrop = el('div', { class: 'modal-backdrop' }, box);
    backdrop.addEventListener('pointerdown', () => {
      gate.press();
      const up = () => setTimeout(gate.release, 0);
      window.addEventListener('pointerup', up, { once: true });
      window.addEventListener('pointercancel', up, { once: true });
    });
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) close(null);
    });
    backdrop.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
        // A field's Enter often closes the dialog, which puts focus back on the button
        // that opened it; left alone, the same Enter then presses that button and the
        // dialog opens again. A one-line field has nothing else to do with Enter.
        e.preventDefault();
      }
    });
    open = { close };
    document.addEventListener('keydown', onEscape);
    root.replaceChildren(backdrop);
    shutBehind();
    const first = box.querySelector('[data-autofocus]') || box.querySelector('button, input');
    if (first) first.focus();
  });
}

/**
 * A dialog's error line: a paragraph read out as an alert, hidden until the dialog puts a
 * sentence in it. `cls` styles it (`bd-error` by default); `id` and `text` are optional.
 *
 * The line keeps its one line of room while hidden (`err-line` in styles.css), so an
 * error appearing or going never moves the controls below it under the pointer
 * (behavior note 22, as decision 48 did for the status line). A long sentence ends in an
 * ellipsis; its whole text is the line's title.
 */
export function errorLine(cls = 'bd-error', { id = null, text = '' } = {}) {
  const p = el('p', { class: cls, text, attrs: { role: 'alert', id } });
  keepRoom(p);
  p.hidden = true;
  return p;
}

/** Makes `p` an error line that keeps its room while hidden, its title its whole text. */
export function keepRoom(p) {
  p.classList.add('err-line');
  const sync = () => {
    const t = p.textContent || '';
    if (p.title !== t) p.title = t;
  };
  sync();
  new MutationObserver(sync).observe(p, { childList: true, characterData: true, subtree: true });
  return p;
}

/** Asks for one line of text. Resolves with what was typed, or null when cancelled. */
export function askText({ title, label, value = '', confirmText = 'OK' }) {
  return customDialog((close) => {
    const input = el('input', { attrs: { id: 'ask-text', type: 'text', autocomplete: 'off', spellcheck: 'false', value, 'data-autofocus': true } });
    const go = () => close(input.value);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        go();
      }
    });
    return el(
      'div',
      { class: 'modal', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' } },
      el('h2', { class: 'modal-title', text: title, attrs: { id: 'modal-title' } }),
      el('label', { class: 'bd-field', attrs: { for: 'ask-text' } }, el('span', { text: label }), input),
      el(
        'div',
        { class: 'modal-actions' },
        el('button', { class: 'btn', text: 'Cancel', attrs: { type: 'button' }, on: { click: () => close(null) } }),
        el('button', { class: 'btn btn-primary', text: confirmText, attrs: { type: 'button' }, on: { click: go } }),
      ),
    );
  });
}

/** Asks a question. Resolves true when `confirmText` is chosen. */
export async function confirmDialog({ title, message, confirmText = 'OK', danger = false }) {
  const result = await customDialog((close) => {
    const cancel = el('button', { class: 'btn', text: 'Cancel', attrs: { type: 'button', 'data-autofocus': true }, on: { click: () => close(false) } });
    const ok = el('button', { class: danger ? 'btn btn-danger' : 'btn btn-primary', text: confirmText, attrs: { type: 'button' }, on: { click: () => close(true) } });
    return el(
      'div',
      { class: 'modal', attrs: { role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title', 'aria-describedby': 'modal-message' } },
      el('h2', { class: 'modal-title', text: title, attrs: { id: 'modal-title' } }),
      el('p', { class: 'modal-message', text: message, attrs: { id: 'modal-message' } }),
      el('div', { class: 'modal-actions' }, cancel, ok),
    );
  });
  return result === true;
}
