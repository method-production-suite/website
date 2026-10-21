// The hub (methodproduction.com) as an Astro page with React islands. tools/build.py still
// writes everything else into dist/; Astro builds into .astro-dist/ and
// tools/merge-astro.mjs moves the hub and its /_astro/ files over the Python hub.
import { defineConfig } from "astro/config";
import react from "@astrojs/react";

export default defineConfig({
  site: "https://methodproduction.com",
  outDir: ".astro-dist",
  publicDir: "astro-public",
  integrations: [react()],
  build: { format: "directory", inlineStylesheets: "auto" },
  devToolbar: { enabled: false },
});
