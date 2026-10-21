// The only way the page talks to the app: Tauri's invoke, through one queue so commands
// always run in the order the user made them.

const tauri = window.__TAURI__;

export const connected = Boolean(tauri && tauri.core && typeof tauri.core.invoke === 'function');

let queue = Promise.resolve();

/** Runs a Rust command after every earlier one has finished. Rejects with a plain message. */
export function invoke(cmd, args = {}) {
  const run = async () => {
    if (!connected) throw 'This window is not connected to the app.';
    try {
      return await tauri.core.invoke(cmd, args);
    } catch (e) {
      throw typeof e === 'string' ? e : (e && e.message) || String(e);
    }
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

/**
 * This window's own label, as Tauri gives it (never written into the page: every
 * schedule window has its own, decisions.md entry 88). Empty when not connected.
 */
function ownLabel() {
  const ww = tauri && tauri.webviewWindow;
  if (!ww || typeof ww.getCurrentWebviewWindow !== 'function') return '';
  try {
    return ww.getCurrentWebviewWindow().label || '';
  } catch {
    return '';
  }
}

/**
 * Calls `fn(payload)` for every event named `name` sent to this window, and for every
 * event sent to all windows (the Autosave switch, preferences). Events sent to another
 * window are not heard here.
 */
export function listen(name, fn) {
  const events = tauri && tauri.event;
  const label = ownLabel();
  if (!events || typeof events.listen !== 'function' || !label) return;
  events.listen(name, (e) => fn(e.payload), { target: label }).catch(() => {});
}
