// @ts-check
import { defineConfig } from "astro/config";

// Static output. Near-zero JS; interactivity comes from small inline island
// scripts. Pagefind indexes the built `dist` after `astro build`.
export default defineConfig({
  output: "static",
  trailingSlash: "ignore",
});
