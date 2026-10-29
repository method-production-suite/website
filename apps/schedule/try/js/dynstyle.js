// Styles worked out at run time, such as the spacer heights around the rows the day out
// of days grid draws. Method Budget's ui/js/sheet.js (same owner, same license).
//
// The CSP allows no inline styles, so nothing here touches a style attribute or
// element.style. Each named block of rules lives in its own constructed stylesheet
// (CSSStyleSheet + document.adoptedStyleSheets), which is CSSOM and outside the CSP's
// reach. Every value put into a rule is a number, never schedule text.
//
// Where constructed stylesheets aren't available, setRules() does nothing and the fixed
// sizes in styles.css apply.

const sheets = new Map(); // name -> CSSStyleSheet

export const dynamicStyles =
  typeof CSSStyleSheet === 'function' &&
  typeof CSSStyleSheet.prototype.replaceSync === 'function' &&
  typeof document !== 'undefined' &&
  'adoptedStyleSheets' in document;

/** Replaces the rules in the block `name` (created on first use). False if unsupported. */
export function setRules(name, css) {
  if (!dynamicStyles) return false;
  let sheet = sheets.get(name);
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheets.set(name, sheet);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }
  try {
    sheet.replaceSync(css);
  } catch {
    sheet.replaceSync('');
    return false;
  }
  return true;
}
