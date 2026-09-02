#!/usr/bin/env node
/**
 * Compare production bundle sizes: Next.js (.next) vs Vite SPA (apps/web/dist).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function dirSizeBytes(dir) {
  const files = walkFiles(dir);
  if (files.length === 0 && !fs.existsSync(dir)) return null;
  let total = 0;
  for (const filePath of files) {
    total += fs.statSync(filePath).size;
  }
  return total;
}

function formatBytes(bytes) {
  if (bytes === null) return "n/a";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function gzipSize(filePath) {
  const data = fs.readFileSync(filePath);
  return gzipSync(data).length;
}

function collectViteAssets(distDir) {
  if (!fs.existsSync(distDir)) return [];
  const assetsDir = path.join(distDir, "assets");
  if (!fs.existsSync(assetsDir)) return [];
  return fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js") || name.endsWith(".css"))
    .map((name) => {
      const filePath = path.join(assetsDir, name);
      const stat = fs.statSync(filePath);
      return {
        name,
        raw: stat.size,
        gzip: gzipSize(filePath),
      };
    })
    .sort((a, b) => b.raw - a.raw);
}

function ensureBuild(label, command) {
  console.log(`\n▶ ${label}`);
  execSync(command, { cwd: root, stdio: "inherit" });
}

const skipBuild = process.argv.includes("--skip-build");

if (!skipBuild) {
  ensureBuild("Next.js production build", "npm run build");
  ensureBuild("Vite SPA production build", "npm run build:web");
}

const nextStatic = path.join(root, ".next/static");
const nextStandalone = path.join(root, ".next/standalone");
const viteDist = path.join(root, "apps/web/dist");

const nextStaticBytes = dirSizeBytes(nextStatic);
const nextStandaloneBytes = dirSizeBytes(nextStandalone);
const viteDistBytes = dirSizeBytes(viteDist);
const viteAssets = collectViteAssets(viteDist);
const viteJsGzip = viteAssets
  .filter((asset) => asset.name.endsWith(".js"))
  .reduce((sum, asset) => sum + asset.gzip, 0);

console.log("\n=== Bundle comparison ===\n");
console.log(`Next .next/static (uncompressed tree): ${formatBytes(nextStaticBytes)}`);
console.log(`Next .next/standalone (full server bundle): ${formatBytes(nextStandaloneBytes)}`);
console.log(`Vite apps/web/dist (uncompressed tree): ${formatBytes(viteDistBytes)}`);
console.log(`Vite JS assets (gzip sum): ${formatBytes(viteJsGzip)}`);

if (viteAssets.length > 0) {
  console.log("\nTop Vite assets:");
  for (const asset of viteAssets.slice(0, 12)) {
    console.log(
      `  ${asset.name.padEnd(36)} raw ${formatBytes(asset.raw).padStart(10)}  gzip ${formatBytes(asset.gzip).padStart(10)}`,
    );
  }
}

const reportPath = path.join(viteDist, "bundle-comparison.json");
fs.mkdirSync(viteDist, { recursive: true });
fs.writeFileSync(
  reportPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      nextStaticBytes,
      nextStandaloneBytes,
      viteDistBytes,
      viteJsGzipTotal: viteJsGzip,
      viteAssets,
    },
    null,
    2,
  ),
);
console.log(`\nWrote ${reportPath}`);
