// A context menu drawn in the page (decision 53): the board's right-click menu. Not a native
// menu, so it needs no new capability; the CSP allows no inline styles, so its place on
// screen is a rule in a constructed stylesheet (dynstyle.js), numbers only.
//
// Keys, as menus have them: Up and Down move (Home and End to the ends), Right or Enter
// opens a submenu, Left or Escape closes it, Enter or Space runs an item, Escape closes the
// menu and Tab leaves it. A disabled item can be focused but not run. Pointer: hovering
// an item focuses it and opens its submenu, a click runs it, a press outside closes it.

import { el } from './dom.js';
import { setRules } from './dynstyle.js';

/** The open menu: { root, back (where focus returns), cleanup() }, or null. */
let open = null;

export function isMenuOpen() {
  return open !== null;
}

/** Closes the menu; focus goes back where it was unless `restore` is false. */
export function closeMenu(restore = true) {
  if (!open) return;
  const o = open;
  open = null;
  o.cleanup();
  o.root.remove();
  setRules('ctx-menu', '');
  if (restore && o.back && typeof o.back.focus === 'function') o.back.focus({ preventScroll: true });
}

let seq = 0;

/**
 * Opens a menu at (x, y) in the viewport. `items`: { label, run(), disabled, key (shortcut
 * text), items (a submenu) } or 'sep'. `label` names the menu; focus returns to `back`
 * when it closes, and goes to the first item now.
 */
export function openMenu(x, y, items, { label, back }) {
  closeMenu(false);
  const root = buildMenu(items, label, 0);
  root.id = 'ctx-menu';
  document.body.append(root);
  place(root, x, y);

  const onDown = (e) => {
    if (!root.contains(e.target)) closeMenu(false);
  };
  const onLeave = () => closeMenu(false);
  document.addEventListener('pointerdown', onDown, true);
  window.addEventListener('blur', onLeave);
  window.addEventListener('resize', onLeave);
  open = {
    root,
    back,
    cleanup() {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('blur', onLeave);
      window.removeEventListener('resize', onLeave);
    },
  };
  const first = menuItems(root)[0];
  if (first) first.focus({ preventScroll: true });
}

/** The page has no inline styles: the menu's corner is a stylesheet rule, kept on screen. */
function place(root, x, y) {
  const at = (left, top) => setRules('ctx-menu', `#ctx-menu { left: ${Math.round(left)}px; top: ${Math.round(top)}px; }`);
  at(x, y);
  const r = root.getBoundingClientRect();
  const left = Math.max(4, Math.min(x, window.innerWidth - r.width - 4));
  const top = Math.max(4, Math.min(y, window.innerHeight - r.height - 4));
  if (left !== x || top !== y) at(left, top);
  // Submenus open to the left when there is no room for them to the right.
  root.classList.toggle('flip-x', left + r.width * 2 > window.innerWidth);
}

/** The items of one menu level, in order (not its submenus' items). */
function menuItems(menu) {
  return [...menu.children].map((c) => c.querySelector(':scope > .ctx-item')).filter(Boolean);
}

function buildMenu(items, label, depth) {
  const menu = el('div', { class: `ctx-menu${depth ? ' ctx-sub' : ''}`, attrs: { role: 'menu', 'aria-label': label } });
  for (const item of items) {
    if (item === 'sep') {
      menu.append(el('div', { class: 'ctx-sep', attrs: { role: 'separator' } }));
      continue;
    }
    const id = `ctx-item-${seq++}`;
    const node = el(
      'div',
      {
        class: 'ctx-item',
        attrs: { role: 'menuitem', tabindex: '-1', id, 'aria-disabled': item.disabled ? 'true' : null, 'aria-haspopup': item.items ? 'menu' : null, 'aria-expanded': item.items ? 'false' : null },
      },
      el('span', { class: 'ctx-label', text: item.label }),
      item.items ? el('span', { class: 'ctx-key', text: '▸', attrs: { 'aria-hidden': 'true' } }) : item.key ? el('span', { class: 'ctx-key', text: item.key }) : null,
    );
    const wrap = el('div', { class: 'ctx-wrap', attrs: { role: 'none' } }, node);
    let sub = null;
    if (item.items) {
      sub = buildMenu(item.items, item.label, depth + 1);
      sub.hidden = true;
      wrap.append(sub);
    }
    const openSub = (focusFirst) => {
      if (!sub || item.disabled) return;
      closeSubs(menu, sub);
      sub.hidden = false;
      node.setAttribute('aria-expanded', 'true');
      node.classList.add('open');
      sub.classList.remove('ctx-up');
      const r = sub.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 4) sub.classList.add('ctx-up');
      if (focusFirst) {
        const f = menuItems(sub)[0];
        if (f) f.focus({ preventScroll: true });
      }
    };
    const runIt = () => {
      if (item.disabled) return;
      if (sub) {
        openSub(true);
        return;
      }
      closeMenu(true);
      item.run();
    };
    node.addEventListener('click', (e) => {
      e.stopPropagation();
      runIt();
    });
    node.addEventListener('pointerenter', () => {
      node.focus({ preventScroll: true });
      if (sub) openSub(false);
      else closeSubs(menu, null);
    });
    node.addEventListener('keydown', (e) => {
      const list = menuItems(menu);
      const i = list.indexOf(node);
      let handled = true;
      if (e.key === 'ArrowDown') list[(i + 1) % list.length].focus({ preventScroll: true });
      else if (e.key === 'ArrowUp') list[(i - 1 + list.length) % list.length].focus({ preventScroll: true });
      else if (e.key === 'Home') list[0].focus({ preventScroll: true });
      else if (e.key === 'End') list[list.length - 1].focus({ preventScroll: true });
      else if (e.key === 'ArrowRight' && sub) openSub(true);
      else if (e.key === 'Enter' || e.key === ' ') runIt();
      else if ((e.key === 'ArrowLeft' || e.key === 'Escape') && depth > 0) {
        const parent = menu.parentElement.querySelector(':scope > .ctx-item');
        closeSubs(menu.parentElement.parentElement, null);
        parent.focus({ preventScroll: true });
      } else if (e.key === 'Escape') closeMenu(true);
      else if (e.key === 'Tab') closeMenu(true);
      else if (e.key !== 'ArrowLeft') handled = false;
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
    menu.append(wrap);
  }
  return menu;
}

/** Hides every open submenu of `menu` but `keep`. */
function closeSubs(menu, keep) {
  for (const sub of menu.querySelectorAll(':scope > .ctx-wrap > .ctx-sub')) {
    if (sub === keep) continue;
    closeSubs(sub, null);
    sub.hidden = true;
    const item = sub.parentElement.querySelector(':scope > .ctx-item');
    item.setAttribute('aria-expanded', 'false');
    item.classList.remove('open');
  }
}
