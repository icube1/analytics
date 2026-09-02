import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

/** Marketing site — parallel to Next.js prod; no cutover. */
export default defineConfig({
  site: "https://gala-soft.ru",
  output: "static",
  compressHTML: true,
  build: {
    inlineStylesheets: "auto",
  },
  integrations: [
    sitemap({
      filter: (page) => !page.includes("/404"),
    }),
  ],
});
