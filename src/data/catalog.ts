// apps.toml, as tools/catalog.py hands it over, with the link helpers tools/build.py uses.
import raw from "../../.catalog/catalog.json";

export interface App {
  slug: string;
  name: string;
  domain: string;
  repo: string;
  does: string;
  tagline: string;
  blurb: string;
  status: string;
  platforms: string;
  download?: string;
  issues_public?: boolean;
  accent: [string, string];
}

export interface Suite {
  name: string;
  domain: string;
  org: string;
  discussions: string;
  hello: string;
  hello_live?: boolean;
  mission: string;
  pitch: string;
  lede: string;
}

export const SUITE = raw.suite as Suite;
export const APPS = raw.app as App[];
const LOCAL: boolean = raw.local;

/** Where a link to an app (or, with null, the hub) points. */
export function url(slug: string | null): string {
  if (LOCAL) return slug === null ? "/" : `/${slug}/`;
  if (slug === null) return `https://${SUITE.domain}/`;
  return `https://${APPS.find((a) => a.slug === slug)!.domain}/`;
}

export const pageUrl = (name: string) => (LOCAL ? `/${name}/` : `https://${SUITE.domain}/${name}/`);
export const mark = (a: App, dark = false) => `/_suite/marks/${a.slug}${dark ? "-dark" : ""}.svg`;
export const SUPPORT = "https://github.com/method-production-suite/.github/blob/main/SUPPORT.md";
export const LAUNCHER_DMG =
  "https://github.com/method-production-suite/method-launcher/releases/latest/download/Method-Launcher-macOS.dmg";

/** An app's accent as the custom properties the hub's CSS reads. */
export const accentStyle = (a: App) => `--app-accent:${a.accent[0]};--app-accent-dark:${a.accent[1]}`;
