// In-app updates in the page (src/updater.rs, decision 213): a quiet "Update ready" with
// Restart to Update at the right of the footer once an update has downloaded, the answer to
// a check the user asked for in the status line, and What's New once after an update. The
// page never talks to the updater plugin itself: three commands of ours and the
// `update-status` event.

import { invoke, listen } from './api.js';
import { $ } from './dom.js';
import { guideSheet } from './guide.js';
import { updateMessage } from './logic.js';

/** Sets up the indicator. ctx: { say(text, isError) }. Returns `start()`, run once the
 * first view is drawn. */
export function initUpdates(ctx) {
  const box = $('update-ready');
  const label = $('update-label');
  $('btn-update-restart').addEventListener('click', () => invoke('update_restart').catch((e) => ctx.say(e, true)));
  const show = (s) => {
    if (!s) return;
    box.hidden = s.phase !== 'ready';
    label.textContent = s.version ? `Update ready: ${s.version}` : 'Update ready';
    const m = updateMessage(s);
    if (m) ctx.say(m.text, m.error);
  };
  listen('update-status', show);
  return {
    start() {
      invoke('update_status').then(show).catch(() => {});
      invoke('update_whats_new')
        .then((notes) => (notes ? guideSheet(notes) : null))
        .catch(() => {});
    },
  };
}
