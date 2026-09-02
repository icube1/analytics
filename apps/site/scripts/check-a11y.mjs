#!/usr/bin/env node
/**
 * Lightweight a11y / responsive readiness checks on built HTML.
 * Not a substitute for manual screen-reader testing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

const pages = ["index.html", "privacy/index.html"];

if (!fs.existsSync(dist)) {
  console.error("dist/ missing — run npm run build first");
  process.exit(1);
}

for (const rel of pages) {
  const html = fs.readFileSync(path.join(dist, rel), "utf8");
  const { document } = parseHTML(html);
  const issues = [];

  if (document.documentElement.getAttribute("lang") !== "ru") {
    issues.push("html lang must be ru");
  }

  if (!document.querySelector('meta[name="viewport"]')) {
    issues.push("missing viewport meta");
  }

  if (!document.querySelector("h1")) {
    issues.push("missing h1");
  }

  if (!document.querySelector(".skip-link, a[href='#main']")) {
    issues.push("missing skip link");
  }

  const images = [...document.querySelectorAll("img")];
  for (const img of images) {
    const alt = img.getAttribute("alt");
    const hidden = img.getAttribute("aria-hidden");
    if (alt === null && hidden !== "true") {
      issues.push(`img without alt or aria-hidden: ${img.getAttribute("src")}`);
    }
  }

  const demo = document.querySelector("[data-reserve-demo]");
  if (rel === "index.html" && demo) {
    if (!demo.querySelector("[aria-live]")) {
      issues.push("demo missing aria-live region");
    }
    if (!demo.querySelector("#demo-disclaimer, .disclaimer")) {
      issues.push("demo missing disclaimer");
    }
  }

  if (issues.length > 0) {
    console.error(`✗ ${rel}:`);
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exit(1);
  }

  console.log(`✓ ${rel} a11y checks passed`);
}

console.log("✓ all a11y checks passed");
