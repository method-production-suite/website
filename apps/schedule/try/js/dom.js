// Tiny DOM helpers. Text always goes in through textContent, never innerHTML, so nothing
// in a schedule or a script can turn into markup or script.

import { quietField } from './logic.js';

/**
 * Creates an element.
 * props: { class, text, title, attrs: {name: value}, data: {key: value}, on: {event: fn} }
 * children: nodes or strings (strings become text nodes); null and false are skipped.
 *
 * A text field gets autocomplete off unless it says otherwise, and a search box no
 * spelling or correction either, so WebKit offers no list of its own over it
 * (decisions.md, entry 164).
 */
export function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  if (props.class) e.className = props.class;
  if (props.text !== undefined && props.text !== null) e.textContent = String(props.text);
  if (props.title) e.title = props.title;
  if (props.attrs) {
    for (const [k, v] of Object.entries(props.attrs)) {
      if (v === false || v === null || v === undefined) continue;
      e.setAttribute(k, v === true ? '' : String(v));
    }
  }
  if (tag === 'input' || tag === 'textarea') {
    for (const [k, v] of Object.entries(quietField(tag, props.attrs))) e.setAttribute(k, v);
  }
  if (props.data) {
    for (const [k, v] of Object.entries(props.data)) e.dataset[k] = String(v);
  }
  if (props.on) {
    for (const [k, fn] of Object.entries(props.on)) e.addEventListener(k, fn);
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    e.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

/**
 * Puts an image thumbnail (a data: URL from Rust) into `box`. When the page can't draw
 * that type (HEIC, TIFF or BMP outside macOS's WebKit) the box shows the file's name.
 */
export function showThumb(box, url, name) {
  const img = el('img', {
    attrs: { src: url, alt: '' },
    on: {
      error: () => {
        box.textContent = name;
        box.title = `${name} is there but can't be drawn on this computer`;
      },
    },
  });
  box.replaceChildren(img);
}

export function $(id) {
  return document.getElementById(id);
}

/** True on macOS, where shortcuts use Command instead of Control. */
export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** True when focus is in a text field (where the browser's own editing keys apply). */
export function isTextField(node) {
  if (!node || !node.tagName) return false;
  const t = node.tagName;
  return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || node.isContentEditable;
}
