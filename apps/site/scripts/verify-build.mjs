#!/usr/bin/env node
/**
 * Production build verification for apps/site — runs astro build and asserts
 * SEO artifacts, size budget, and basic HTML structure.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

const MAX_TOTAL_BYTES = 512 * 1024;
const MAX_INLINE_JS_GZIP_BYTES = 8 * 1024;

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

console.log("→ astro build");
execSync("npx astro build", { cwd: root, stdio: "inherit" });

const required = [
  "index.html",
  "privacy/index.html",
  "robots.txt",
  "favicon.svg",
  "sitemap-index.xml",
];

for (const rel of required) {
  const full = path.join(dist, rel);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing build artifact: ${rel}`);
  }
}

const indexHtml = fs.readFileSync(path.join(dist, "index.html"), "utf8");
const checks = [
  ["lang=ru", /lang="ru"/.test(indexHtml)],
  ["viewport meta", /<meta name="viewport"/.test(indexHtml)],
  ["description meta", /<meta name="description"/.test(indexHtml)],
  ["canonical link", /<link rel="canonical"/.test(indexHtml)],
  ["skip link", /skip-link/.test(indexHtml)],
  ["app link", /app\.gala-soft\.ru/.test(indexHtml)],
  ["demo disclaimer", /не гарантирует/i.test(indexHtml)],
  ["no google analytics", !/googletagmanager|google-analytics/i.test(indexHtml)],
];

for (const [label, ok] of checks) {
  if (!ok) throw new Error(`HTML check failed: ${label}`);
}

const files = walkFiles(dist);
let total = 0;
let jsGzip = 0;
let inlineJsGzip = 0;

for (const file of files) {
  const buf = fs.readFileSync(file);
  total += buf.length;
  if (file.endsWith(".js")) {
    jsGzip += gzipSync(buf).length;
  }
}

const scriptMatch = indexHtml.match(/<script[^>]*>([\s\S]*?)<\/script>/);
if (scriptMatch?.[1]) {
  inlineJsGzip = gzipSync(Buffer.from(scriptMatch[1], "utf8")).length;
}

console.log(`\nBuild size: ${formatBytes(total)} (${files.length} files)`);
console.log(`JS files (gzip): ${formatBytes(jsGzip)}`);
console.log(`Inline demo JS (gzip): ${formatBytes(inlineJsGzip)}`);

if (total > MAX_TOTAL_BYTES) {
  throw new Error(
    `Total dist size ${formatBytes(total)} exceeds budget ${formatBytes(MAX_TOTAL_BYTES)}`,
  );
}

if (inlineJsGzip > MAX_INLINE_JS_GZIP_BYTES) {
  throw new Error(
    `Inline JS gzip ${formatBytes(inlineJsGzip)} exceeds budget ${formatBytes(MAX_INLINE_JS_GZIP_BYTES)}`,
  );
}

console.log("✓ site build verification passed");
