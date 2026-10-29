// Date fields (decisions.md, entry 49). The app's dates are typed into plain text
// fields, not <input type="date">: in WKWebView the date control's month, day and year
// parts don't move on as you type, so a typed date needed Right Arrow between parts.
//
// A field takes `2027-03-01`, or month, day and year with slashes (`3/1/2027`,
// `03/01/2027`), and shows a date back in the user's format (ISO unless set to US).
// Rust reads what was typed the same way (src/calendar.rs, `typed_date`) and refuses
// anything else with a plain sentence; this copy only tidies the field.

import { el } from './dom.js';
import { typedDate } from './logic.js';

const DASHED = /^(\d{4})-(\d{2})-(\d{2})$/;

// The user's date format (decision 59; settings.json through `preferences`, never the
// schedule): `iso` shows 2027-03-01, `us` 3/1/2027 and `long` Mon 1 Mar 2027. A date
// field shows ISO or US back (long reads poorly when typed over); Rust reads either.
let format = 'iso';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Sets the date format the page shows dates in: `iso`, `us` or `long`. */
export function setDateFormat(f) {
  format = ['iso', 'us', 'long'].includes(f) ? f : 'iso';
  // Date fields already drawn hint the new format too (behavior note 22).
  for (const input of document.querySelectorAll('input[data-date-hint]')) input.placeholder = datePlaceholder();
}

/**
 * The hint an empty date field shows: the form it shows dates back in, written as
 * letters (`YYYY-MM-DD` or `M/D/YYYY`), never a sample date, which reads like a value
 * (behavior note 23).
 */
export function datePlaceholder() {
  return format === 'us' ? 'M/D/YYYY' : 'YYYY-MM-DD';
}

export function dateFormat() {
  return format;
}

/**
 * `iso` (`YYYY-MM-DD`) in the user's format; empty for none. `forField`: as a date field
 * shows it (ISO or US). Anything that isn't a date comes back as it is.
 */
export function showDate(iso, forField = false) {
  if (iso === null || iso === undefined || iso === '') return '';
  const r = DASHED.exec(String(iso));
  if (!r) return String(iso);
  const [y, m, d] = [r[1], r[2], r[3]].map(Number);
  if (format === 'us') return `${m}/${d}/${y}`;
  if (format === 'long' && !forField) {
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return `${WEEKDAYS[wd]} ${d} ${MONTHS[m - 1]} ${y}`;
  }
  return String(iso);
}

/**
 * A day's weekday and date as the user likes dates: `Mon 2027-03-01`, `Mon 3/1/2027`, or
 * the long format alone (`Mon 1 Mar 2027`, which names the weekday itself).
 */
export function dayDate(weekday, iso) {
  if (!iso) return '';
  if (format === 'long') return showDate(iso);
  return weekday ? `${weekday} ${showDate(iso)}` : showDate(iso);
}

/** What a date field says it takes, for placeholders and messages. */
export const DATE_HINT = '3/1/2027 or 2027-03-01';

/** A typed date as `YYYY-MM-DD`, or null (logic.js). */
export { typedDate };

/**
 * A text field for a date. `attrs` go on the input (id, value, aria-label...). Leaving
 * the field shows a date it holds as `YYYY-MM-DD` and marks text that isn't one
 * (`aria-invalid`); what to do with the value is the caller's (a `change` listener, or
 * reading `.value` on save).
 */
export function dateInput(attrs = {}) {
  // The hint follows the date format in Settings, never one fixed form (behavior note 22);
  // a field given its own placeholder keeps it.
  const own = attrs.placeholder !== undefined;
  const input = el('input', {
    class: `date-field${attrs.class ? ` ${attrs.class}` : ''}`,
    attrs: { type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: datePlaceholder(), title: `A date, typed as ${DATE_HINT}`, ...attrs, class: null, 'data-date-hint': own ? null : 'true' },
  });
  input.addEventListener('blur', () => tidy(input));
  return input;
}

/** Shows the field's date as `YYYY-MM-DD`; marks text that isn't a date. True when it holds one (or nothing). */
export function tidy(input) {
  const t = input.value.trim();
  const iso = typedDate(t);
  if (iso && input.value !== showDate(iso, true)) input.value = showDate(iso, true);
  const bad = Boolean(t) && !iso;
  if (bad) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
  return !bad;
}
