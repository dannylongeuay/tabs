// @ts-check
import { defineConfig } from "astro/config";
import pagefind from "astro-pagefind";

// Static output. Near-zero JS; interactivity comes from small inline island
// scripts. The astro-pagefind integration runs Pagefind indexing on `astro
// build` and serves /pagefind/* from the last build during `astro dev`.
export default defineConfig({
  output: "static",
  trailingSlash: "ignore",
  integrations: [pagefind()],
});
