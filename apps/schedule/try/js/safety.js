// Saving safety in the page: the Autosave switch, schedules recovered after a crash, File
// > Open Recent and files the system asks the app to open. The work is done in Rust
// (src/safety_app.rs); this only asks and draws. Text goes in with textContent only.

import { invoke, listen } from './api.js';
import { el, $ } from './dom.js';
import { customDialog, isModalOpen } from './modal.js';

/** A time in milliseconds since 1970, in the user's own format. */
function formatTime(ms) {
  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : '';
}

/**
 * Lists schedules recovered after the app closed without saving them. `entries`:
 * [{ key, title, name, saved_at_ms }] (recovery_list). `open(key)` opens one; `discard(key)`
 * deletes one and resolves with the rest. Later (or Escape) keeps them for the next start.
 */
export function showRecoveryDialog(entries, { open, discard }) {
  return customDialog((close) => {
    const list = el('ul', { class: 'safety-list' });
    const draw = (items) => {
      if (!items.length) {
        close(null);
        return;
      }
      list.replaceChildren(
        ...items.map((e) => {
          const openBtn = el('button', {
            class: 'btn btn-primary',
            text: 'Open Recovered',
            attrs: { type: 'button' },
            on: {
              click: () => {
                close(null);
                open(e.key);
              },
            },
          });
          // Discarding can't be undone, so it takes a second click.
          const discardBtn = el('button', { class: 'btn', text: 'Discard', attrs: { type: 'button' } });
          discardBtn.addEventListener('click', async () => {
            if (!discardBtn.classList.contains('btn-danger')) {
              discardBtn.classList.add('btn-danger');
              discardBtn.textContent = 'Discard for Good';
              return;
            }
            discardBtn.disabled = true;
            draw(await discard(e.key));
          });
          const where = e.name === 'Untitled' ? 'Untitled (never saved)' : e.name;
          return el(
            'li',
            { class: 'safety-item' },
            el(
              'div',
              { class: 'safety-item-text' },
              el('div', { class: 'safety-item-main', text: e.title || e.name }),
              el('div', { class: 'safety-item-sub', text: where }),
              el('div', { class: 'safety-item-sub', text: `Autosaved ${formatTime(e.saved_at_ms)}` }),
            ),
            el('div', { class: 'safety-item-actions' }, openBtn, discardBtn),
          );
        }),
      );
    };
    draw(entries);
    const later = el('button', { class: 'btn', text: 'Later', attrs: { type: 'button', 'data-autofocus': true }, on: { click: () => close(null) } });
    return el(
      'div',
      { class: 'modal modal-wide', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'safety-title' } },
      el('h2', { class: 'modal-title', text: 'Recovered schedules', attrs: { id: 'safety-title' } }),
      el('p', {
        class: 'modal-message',
        text: 'Method Schedule closed before these changes were saved. Open one to keep working on it, or discard it. Later keeps them for next time.',
      }),
      list,
      el('div', { class: 'modal-actions' }, later),
    );
  });
}

/**
 * Sets up saving safety. `ctx`: { apply(promise) shows a command's view, say(text, isError),
 * fileState(file) updates the file name and the edited mark }. Returns `start()`, run once
 * the first view is drawn, and `openRecent(index)` for File > Open Recent.
 */
export function initSafety(ctx) {
  const toggle = $('autosave');
  const setToggle = (on) => {
    toggle.checked = Boolean(on);
  };
  toggle.closest('label').title =
    'Save into the schedule file a few seconds after each change. A schedule not saved yet gets a recovery copy instead.';
  toggle.addEventListener('change', async () => {
    try {
      setToggle(await invoke('set_autosave', { on: toggle.checked }));
    } catch (e) {
      ctx.say(e, true);
    }
  });
  listen('autosave-changed', setToggle);
  listen('file-state', (file) => file && typeof file === 'object' && ctx.fileState(file));
  listen('autosave-error', (msg) => ctx.say(String(msg), true));
  listen('open-request', () => openPending());

  // A file from the system (double-click, Open With): wait for any dialog, then ask Rust to
  // open it (it asks about unsaved changes first).
  let opening = false;
  async function openPending() {
    if (opening) return;
    opening = true;
    try {
      while (isModalOpen()) await new Promise((r) => setTimeout(r, 300));
      await ctx.apply(invoke('open_pending'));
    } finally {
      opening = false;
    }
  }

  async function offerRecovery() {
    let entries = [];
    try {
      entries = await invoke('recovery_list');
    } catch (e) {
      ctx.say(e, true);
      return;
    }
    if (!entries.length) return;
    await showRecoveryDialog(entries, {
      open: (key) => ctx.apply(invoke('open_recovered', { key })),
      discard: async (key) => {
        try {
          return await invoke('discard_recovered', { key });
        } catch (e) {
          ctx.say(e, true);
          return [];
        }
      },
    });
  }

  return {
    setToggle,
    async start() {
      await openPending();
      await offerRecovery();
    },
    openRecent(index) {
      return ctx.apply(invoke('open_recent', { index }));
    },
  };
}
