// Laying a report out into printable pages, and printing them. Method Budget's
// ui/js/report.js approach (same owner, same license), scaled down.
//
// The system web view repeats no table headings, draws no page numbers and ignores @page
// margin boxes when it prints, so the report is laid out here into Letter-sized page
// boxes, each with its own header, column headings and footer. Rows are measured once in
// a hidden page-wide box, then dealt onto pages, keeping a row with the next while it is
// marked `keep` (a day's lines stay together when they fit on a page, so page breaks fall
// between days). A flow follows the one before on the same page while its start fits,
// unless it asks for a new page (`newPage`, each day of the shooting schedule). "Page X of Y" works because the pages
// are counted here. Printing hands those pages to the print sheet, or straight into a PDF
// file (src/reports.rs); each box is exactly one sheet of paper.
//
// Text goes in through textContent only (dom.js); no inline styles. The page size and the
// preview's scale are constructed-stylesheet rules holding only numbers (dynstyle.js).
//
//   layout(container, flows, opts)   lays flows out into pages in container
//   scalePreview(width, landscape)    fits the Reports tab's preview to a width
//   printPages(draw, opts)            prints what draw(root) lays out
//   td, th, row                       a flow's cells and rows, for the reports and the board
//
// opts.repeat, when given, makes the block each page carries above its band (a report
// header layout printed on every page).
//
// A flow: { name, cls, cols: [col classes], head: <tr> or null, rows: [{ el: <tr>, keep }],
// intro: element or null, newPage }. The name of the first flow on a page is the page
// header's center.

import { el } from './dom.js';
import { setRules } from './dynstyle.js';
import { invoke, connected } from './api.js';

/** A table cell with text (none for null), its classes and how many columns it spans. */
export const td = (text, cls, span) => el('td', { class: cls || '', text: text === null || text === undefined ? '' : String(text), attrs: span ? { colspan: String(span) } : {} });
/** A column heading. */
export const th = (text, cls) => el('th', { class: cls || '', text, attrs: { scope: 'col' } });
/** A flow's row: the table row, and whether it keeps with the next one on a page. */
export const row = (tr, keep = false) => ({ el: tr, keep });

// Letter paper in CSS pixels (96 to the inch), and the page's own margins (print.css).
export const PAPER = { w: 816, h: 1056 };
const MARGIN = { top: 40, bottom: 36 };
// Height kept spare on each page for rounding between measuring and drawing.
const SLACK = 6;

export function pageSize(landscape) {
  return landscape ? { w: PAPER.h, h: PAPER.w } : { ...PAPER };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "11 Oct 2026", from the computer's clock: when the report was printed. */
export function printedDate(now = new Date()) {
  return `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
}

function band(slots, cls) {
  return el(
    'div',
    { class: `rpt-band ${cls}` },
    el('span', { class: `rpt-slot left${slots.strong ? ' strong' : ''}`, text: slots.left || '' }),
    el('span', { class: 'rpt-slot center', text: slots.center || '' }),
    el('span', { class: 'rpt-slot right', text: slots.right || '' }),
  );
}

function header(opts, page) {
  const b = band({ left: opts.title, center: page.section, right: `Printed ${opts.printed}`, strong: true }, 'rpt-head');
  // A report header layout printed on every page sits above the band (decisions.md, entry 99).
  const top = opts.repeat ? opts.repeat() : null;
  return top ? el('div', { class: 'rpt-top' }, top, b) : b;
}

function footer(opts, page) {
  return band({ left: opts.place || '', right: `Page ${page.n} of ${page.of}` }, 'rpt-foot');
}

function rootClass(opts) {
  const size = opts.size === 'small' || opts.size === 'large' ? ` text-${opts.size}` : '';
  return `method-report${opts.landscape ? ' landscape' : ''}${size}`;
}

function tableFor(flow) {
  return el('table', { class: 'rpt-table' }, el('colgroup', {}, ...flow.cols.map((c) => el('col', { class: c }))));
}

/** Space between two flows on one page, in CSS pixels: `.rpt-seg + .rpt-seg` in print.css. */
const SEG_GAP = 18;

/**
 * Measures every flow's rows in a hidden page body, then deals them onto pages. A page is
 * { segs: [{ flow, intro, rows: [<tr>], first }] }: one segment per flow on it, `first`
 * when the flow starts there.
 */
function paginate(flows, opts) {
  const size = pageSize(opts.landscape);
  const host = el('div', { class: `${rootClass(opts)} rpt-measure`, attrs: { 'aria-hidden': 'true' } });
  const body = el('div', { class: 'rpt-body' });
  host.append(body);
  document.body.append(host);
  try {
    const probe = { section: 'Section', n: 88, of: 88 };
    const hb = header(opts, probe);
    const fb = footer(opts, probe);
    host.append(hb, fb);
    const outer = (b) => {
      const cs = getComputedStyle(b);
      return b.getBoundingClientRect().height + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
    };
    const avail = size.h - MARGIN.top - MARGIN.bottom - outer(hb) - outer(fb) - SLACK;
    hb.remove();
    fb.remove();

    const pages = [];
    let page = null;
    let used = 0;
    for (const flow of flows) {
      const t = tableFor(flow);
      const thead = el('thead');
      if (flow.head) thead.append(flow.head);
      t.append(thead, el('tbody', {}, ...flow.rows.map((r) => r.el)));
      body.replaceChildren(el('div', { class: `rpt-seg ${flow.cls || ''}` }, flow.intro, t));
      const introH = flow.intro ? flow.intro.getBoundingClientRect().height : 0;
      const headH = flow.head ? flow.head.getBoundingClientRect().height : 0;
      const hs = flow.rows.map((r) => r.el.getBoundingClientRect().height);
      const room = avail - headH;

      let seg = null;
      let started = false;
      const openPage = () => {
        page = { segs: [] };
        pages.push(page);
        used = 0;
      };
      const openSeg = (intro) => {
        if (page.segs.length) used += SEG_GAP;
        seg = { flow, intro, rows: [], first: !started };
        started = true;
        page.segs.push(seg);
        used += (intro ? introH : 0) + headH;
      };
      // A flow starts a new page when it asks to, or when its start (intro, heading and
      // first rows kept with it) doesn't fit in what is left of this one.
      const firstH = (() => {
        let h = hs.length ? hs[0] : 0;
        for (let j = 0; flow.rows[j] && flow.rows[j].keep && j + 1 < hs.length && h + hs[j + 1] <= room; j++) h += hs[j + 1];
        return h;
      })();
      if (!page || flow.newPage || used + SEG_GAP + introH + headH + firstH > avail) openPage();
      openSeg(flow.intro || null);
      const newPage = () => {
        openPage();
        openSeg(null);
      };
      const n = flow.rows.length;
      let i = 0;
      while (i < n) {
        let j = i;
        let h = hs[i];
        while (flow.rows[j].keep && j + 1 < n && h + hs[j + 1] <= room) {
          j += 1;
          h += hs[j];
        }
        if (used + h > avail && seg.rows.length) newPage();
        if (used + h > avail) {
          // Taller than a page even alone: place row by row.
          for (let k = i; k <= j; k++) {
            if (used + hs[k] > avail && seg.rows.length) newPage();
            seg.rows.push(flow.rows[k].el);
            used += hs[k];
          }
        } else {
          for (let k = i; k <= j; k++) seg.rows.push(flow.rows[k].el);
          used += h;
        }
        i = j + 1;
      }
    }
    return pages;
  } finally {
    host.remove();
  }
}

/**
 * Lays `flows` out into pages in `container` (which must be in the document), replacing
 * what it held. opts: { title, place, landscape, printed, size }. Returns { pages }.
 */
export function layout(container, flows, opts) {
  const o = { printed: printedDate(), ...opts };
  const dealt = paginate(flows, o);
  const root = el('div', { class: `${rootClass(o)} rpt-pages`, attrs: { 'aria-label': `${o.title} report` } });
  dealt.forEach((p, k) => {
    const page = { section: p.segs.length ? p.segs[0].flow.name : '', n: k + 1, of: dealt.length };
    const segs = p.segs.map((s) => {
      const t = tableFor(s.flow);
      // The flow's own heading row where it starts, a copy on the pages after.
      if (s.flow.head) t.append(el('thead', {}, s.first ? s.flow.head : s.flow.head.cloneNode(true)));
      t.append(el('tbody', {}, ...s.rows));
      return el('div', { class: `rpt-seg ${s.flow.cls || ''}` }, s.intro, t);
    });
    const body = el('div', { class: 'rpt-body' }, ...segs);
    const sheet = el('div', { class: 'rpt-page', data: { page: k + 1 } }, header(o, page), body, footer(o, page));
    root.append(el('div', { class: 'rpt-sheet' }, sheet));
  });
  container.replaceChildren(root);
  return { pages: dealt.length };
}

/** Fits the preview's pages to `width` pixels (a scale rule; the pages keep their layout). */
export function scalePreview(width, landscape) {
  const size = pageSize(landscape);
  const scale = Math.max(0.2, Math.min(1.25, width / size.w));
  setRules(
    'report-preview',
    `.rpt-preview .rpt-sheet { width: ${Math.round(size.w * scale)}px; height: ${Math.round(size.h * scale)}px; }\n` +
      `.rpt-preview .rpt-page { transform: scale(${scale.toFixed(4)}); }`,
  );
  return scale;
}

// ---------------------------------------------------------------------------
// Printing

let pending = null;

/**
 * Prints what `draw(root)` lays out into #print-root: through the print sheet, or with
 * `pdf` into a PDF file the user picks (macOS; src/reports.rs). Elsewhere, the system
 * print dialog (whose PDF choice saves a file). Resolves with { done, file } once it is
 * over (`system` when the system dialog was used, which says nothing about how it ended).
 */
export async function printPages(draw, { landscape = false, pdf = false, title = '', subject = '' } = {}) {
  if (pending) pending();
  let root = document.getElementById('print-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'print-root';
    document.body.append(root);
  }
  draw(root);
  const size = pageSize(landscape);
  setRules('report-page', `@page { size: ${size.w / 96}in ${size.h / 96}in; margin: 0; }`);

  const html = document.documentElement;
  const oldTitle = document.title;
  if (title) document.title = title; // the default file name for a PDF from the dialog
  html.classList.add('printing');
  let finished = false;
  const cleanup = () => {
    if (finished) return;
    finished = true;
    if (pending === cleanup) pending = null;
    html.classList.remove('printing');
    document.title = oldTitle;
    root.replaceChildren();
    setRules('report-page', '');
  };
  pending = cleanup;

  if (connected) {
    let outcome = null;
    try {
      outcome = await invoke('print_report', { pdf, landscape, title: title || 'Report', subject: subject || null });
    } catch (e) {
      cleanup();
      throw e;
    }
    if (outcome && outcome.supported) {
      cleanup();
      return { done: outcome.done === true, file: outcome.file || null };
    }
  }
  return systemPrint(cleanup);
}

/** window.print(), cleaning up afterwards however the web view reports it. */
function systemPrint(cleanup) {
  return new Promise((resolve) => {
    let timer = 0;
    const end = () => {
      clearTimeout(timer);
      window.removeEventListener('afterprint', end);
      document.removeEventListener('pointerdown', end, true);
      document.removeEventListener('keydown', end, true);
      cleanup();
      resolve({ done: true, file: null, system: true });
    };
    window.addEventListener('afterprint', end);
    const started = Date.now();
    try {
      const shown = window.print();
      if (shown && typeof shown.then === 'function') shown.catch(end);
    } catch {
      end();
      return;
    }
    // Some web views return from print() at once and show the dialog as a sheet; others
    // block until it closes. If it blocked, we are done. If not, clean up on afterprint,
    // on the next input after the dialog closes, or after a long fallback timeout.
    if (Date.now() - started > 1000) {
      setTimeout(end, 0);
      return;
    }
    setTimeout(() => {
      document.addEventListener('pointerdown', end, true);
      document.addEventListener('keydown', end, true);
    }, 500);
    timer = setTimeout(end, 10 * 60 * 1000);
  });
}
