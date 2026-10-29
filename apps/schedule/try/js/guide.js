// Help > User Guide (decisions.md, entry 199): docs/GUIDE.md, built into the app and sent
// by Rust (`user_guide`), shown read-only in a dialog of the page's own. Its sections are
// listed down the side; a click scrolls to one. Drawn with text nodes only (logic.js reads
// the Markdown), and it opens nothing: no browser, no network.

import { el } from './dom.js';
import { customDialog } from './modal.js';
import { guideBlocks, guideRuns } from './logic.js';

/** A line of the guide as inline elements. */
function inline(text) {
  return guideRuns(text).map((r) => {
    if (r.code) return el('code', { text: r.text });
    if (r.bold) return el('strong', { text: r.text });
    if (r.em) return el('em', { text: r.text });
    return r.text;
  });
}

/** Markdown as page nodes, text only: headings, paragraphs, lists and fenced blocks. */
function markdownNodes(text) {
  return guideBlocks(text).map((b) => {
    if (b.kind === 'pre') return el('pre', { class: 'guide-pre', text: b.text });
    if (b.kind === 'ul') return el('ul', {}, ...b.items.map((i) => el('li', {}, ...inline(i))));
    if (b.kind === 'p') return el('p', {}, ...inline(b.text));
    return el(b.kind === 'h1' ? 'h3' : b.kind === 'h2' ? 'h4' : 'h5', {}, ...inline(b.text));
  });
}

/** Shows the guide. Resolves when it is closed. */
export function guideSheet(text) {
  return customDialog((close) => {
    const blocks = guideBlocks(text);
    const title = (blocks.find((b) => b.kind === 'h1') || {}).text || 'User Guide';
    const body = el('div', { class: 'guide-body', attrs: { tabindex: '0', 'aria-label': 'The user guide' } });
    const toc = el('nav', { class: 'guide-toc', attrs: { 'aria-label': 'Sections' } });
    let n = 0;
    for (const b of blocks) {
      if (b.kind === 'h1') continue;
      if (b.kind === 'pre') {
        body.append(el('pre', { class: 'guide-pre', text: b.text }));
      } else if (b.kind === 'ul') {
        body.append(el('ul', {}, ...b.items.map((i) => el('li', {}, ...inline(i)))));
      } else if (b.kind === 'p') {
        body.append(el('p', {}, ...inline(b.text)));
      } else {
        const id = `guide-${(n += 1)}`;
        const h = el(b.kind === 'h2' ? 'h3' : 'h4', { attrs: { id } }, ...inline(b.text));
        body.append(h);
        if (b.kind === 'h2') {
          toc.append(el('button', { class: 'guide-link', text: b.text, attrs: { type: 'button' }, on: { click: () => h.scrollIntoView({ block: 'start' }) } }));
        }
      }
    }
    return el(
      'div',
      { class: 'modal modal-wider guide', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'guide-title' } },
      el('h2', { class: 'modal-title', text: title, attrs: { id: 'guide-title' } }),
      el('div', { class: 'guide-panes' }, toc, body),
      el('div', { class: 'modal-actions' }, el('button', { class: 'btn btn-primary', text: 'Close', attrs: { type: 'button', 'data-autofocus': true }, on: { click: () => close(null) } })),
    );
  });
}

/**
 * Help > Licenses and Notices (decision 212): Method Schedule's two licenses and the
 * third-party notices (THIRD-PARTY-NOTICES.md), built into the app and sent by Rust
 * (`notices`). One text at a time, picked down the side: the notices drawn from their
 * Markdown as the guide is (headings, paragraphs, the license texts kept as written), the
 * two licenses as plain text (decision 219).
 */
export function noticesSheet(n) {
  return customDialog((close) => {
    const texts = [
      ['Third-party notices', n.third_party],
      ['MIT License', n.mit],
      ['Apache License 2.0', n.apache],
    ];
    const body = el('div', { class: 'guide-body', attrs: { tabindex: '0', 'aria-label': texts[0][0] } });
    const toc = el('nav', { class: 'guide-toc', attrs: { 'aria-label': 'Licenses' } });
    const show = (i) => {
      if (i === 0) body.replaceChildren(...markdownNodes(texts[i][1]));
      else body.replaceChildren(el('pre', { class: 'notices-text', text: texts[i][1] }));
      body.setAttribute('aria-label', texts[i][0]);
      body.scrollTop = 0;
      for (const [k, b] of [...toc.children].entries()) b.setAttribute('aria-pressed', k === i ? 'true' : 'false');
    };
    texts.forEach(([label], i) => toc.append(el('button', { class: 'guide-link', text: label, attrs: { type: 'button', 'aria-pressed': 'false' }, on: { click: () => show(i) } })));
    show(0);
    return el(
      'div',
      { class: 'modal modal-wider guide', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'notices-title' } },
      el('h2', { class: 'modal-title', text: 'Licenses and Notices', attrs: { id: 'notices-title' } }),
      el('p', { class: 'modal-message', text: 'Method Schedule is licensed under the MIT License or the Apache License 2.0, at your option. Copyright (c) 2026 Method Production Suite Team and the Method Schedule contributors.' }),
      el('div', { class: 'guide-panes' }, toc, body),
      el('div', { class: 'modal-actions' }, el('button', { class: 'btn btn-primary', text: 'Close', attrs: { type: 'button', 'data-autofocus': true }, on: { click: () => close(null) } })),
    );
  });
}

