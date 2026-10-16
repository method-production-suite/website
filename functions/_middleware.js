// Cloudflare Pages middleware: one deploy, many domains.
//
// Every Method domain points at this one Pages project. The host decides what it gets:
//   - an app domain (methodbudget.com) serves dist/<slug>/ at its root, so the app keeps
//     its own address and its pages' relative links keep working;
//   - methodproduction.com serves the hub at the root;
//   - a redirect-only domain (screepub.com) 301s to its new home, keeping the path;
//   - www.<domain> 301s to the bare domain;
//   - anything else (the *.pages.dev preview address) is served as built: hub at /,
//     apps at /<slug>/.
// /_suite/ (the shared stylesheet and marks) is the same for every host.
// The table comes from apps.toml through tools/build.py.

import { HOSTS } from "./_hosts.js";

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  let host = url.hostname.toLowerCase();

  if (host.startsWith("www.") && HOSTS[host.slice(4)]) {
    url.hostname = host.slice(4);
    return Response.redirect(url.toString(), 301);
  }
  const entry = HOSTS[host];
  if (!entry) return next();
  if (entry.redirect) {
    const to = new URL(entry.redirect);
    to.pathname = url.pathname;
    to.search = url.search;
    return Response.redirect(to.toString(), 301);
  }
  if (!entry.app || url.pathname.startsWith("/_suite/")) return next();

  // An app domain: a request for /<slug>/... from its own domain goes to the clean path.
  const prefix = `/${entry.app}`;
  if (url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)) {
    url.pathname = url.pathname.slice(prefix.length) || "/";
    return Response.redirect(url.toString(), 301);
  }
  const inner = new URL(url);
  inner.pathname = prefix + url.pathname;
  // A missing page comes back as the nearest 404.html with status 404 (Pages does that
  // itself), which for an app is its own dist/<slug>/404.html.
  return env.ASSETS.fetch(new Request(inner, request));
}
