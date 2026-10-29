// The images pane beside the board (split screen, decisions.md, entry 80): the selected
// scene's own images (decisions.md, entry 77) and the images of the elements on its
// sheet (decision 62), as thumbnails Rust reads from the paths the schedule keeps. A
// path whose file is missing shows as missing. Nothing here edits; images are added on
// the Breakdown tab and the Elements tab.

import { el, showThumb } from './dom.js';

/**
 * Builds the pane in `host`. `ctx`: { sheetImage(sheet, at), elementImage(element, at) },
 * each resolving with a data: URL or null. Returns { render(dto) } where `dto` is the
 * sheet (get_sheet), or null when no scene is selected.
 */
export function createImages(host, ctx) {
  let drawnFor = '';

  function thumb(path, load) {
    const name = path.split(/[\\/]/).pop();
    const box = el('span', { class: 'im-thumb', text: 'Loading', attrs: { 'aria-hidden': 'true' } });
    load().then(
      (url) => {
        if (url) showThumb(box, url, name);
        else {
          box.textContent = 'Missing';
          box.title = `No image file at ${path}`;
        }
      },
      () => (box.textContent = 'Missing'),
    );
    return el('figure', { class: 'im-item', title: path, attrs: { role: 'listitem' } }, box, el('figcaption', { text: name }));
  }

  function render(dto) {
    const key = dto ? JSON.stringify([dto.id, dto.images, dto.element_images]) : '';
    if (key === drawnFor) return;
    drawnFor = key;
    if (!dto) {
      host.replaceChildren(el('p', { class: 'empty', text: 'Select a scene on the board to see its images.' }));
      return;
    }
    const title = dto.scenes ? `Scene ${dto.scenes}` : 'This sheet';
    const parts = [el('h2', { class: 'im-title', text: `${title}: images` })];
    const scene = dto.images || [];
    parts.push(el('h3', { text: 'The scene' }));
    parts.push(
      scene.length
        ? el('div', { class: 'im-grid', attrs: { role: 'list', 'aria-label': `${title} images` } }, ...scene.map((p, i) => thumb(p, () => ctx.sheetImage(dto.id, i))))
        : el('p', { class: 'bd-hint', text: 'None yet. Add them on the Breakdown tab with Add Image.' }),
    );
    for (const e of dto.element_images || []) {
      parts.push(el('h3', { text: `${e.name} (${e.category})` }));
      parts.push(el('div', { class: 'im-grid', attrs: { role: 'list', 'aria-label': `${e.name} images` } }, ...e.images.map((p, i) => thumb(p, () => ctx.elementImage(e.element, i)))));
    }
    if (!(dto.element_images || []).length) parts.push(el('p', { class: 'bd-hint', text: 'No element on this sheet has images.' }));
    host.replaceChildren(...parts);
  }

  return { render };
}
