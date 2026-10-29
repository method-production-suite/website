// Per-item act styles as classes in a stylesheet, not style attributes: the app sites'
// Content Security Policy blocks inline style attributes, and an act must still draw its
// finished picture without JavaScript. Each act builds its items once, at module load,
// so the class names are the same on the server and in the browser.
export class Styler {
  private rules = new Map<string, string>();
  constructor(private scope: string, private prefix: string) {}
  /** A class carrying these custom properties (numbers are written as they are). */
  add(vars: Record<string, number | string>): string {
    const body = Object.entries(vars).map(([k, v]) => `${k}:${typeof v === "number" ? +v.toFixed(4) : v}`).join(";");
    let name = this.rules.get(body);
    if (!name) {
      name = `${this.prefix}${this.rules.size}`;
      this.rules.set(body, name);
    }
    return name;
  }
  css(): string {
    return [...this.rules].map(([body, name]) => `${this.scope} .${name}{${body}}`).join("\n");
  }
}
