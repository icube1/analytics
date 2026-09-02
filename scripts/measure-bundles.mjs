#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = process.env.CI_REPORT_DIR
  ? path.resolve(process.env.CI_REPORT_DIR)
  : path.join(root, "ci-reports");

const BUDGETS = {
  nextStandaloneBytes: Number(process.env.BUDGET_NEXT_STANDALONE_BYTES ?? 200 * 1024 * 1024),
  viteDistBytes: Number(process.env.BUDGET_VITE_DIST_BYTES ?? 12 * 1024 * 1024),
  viteJsGzipTotal: Number(process.env.BUDGET_VITE_JS_GZIP_BYTES ?? 600 * 1024),
};

const argv = process.argv.slice(2);
const skipBuild = argv.includes("--skip-build");
const ciMode = argv.includes("--ci");

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(fullPath) : entry.isFile() ? [fullPath] : [];
  });
}

function dirSizeBytes(dir) {
  const files = walkFiles(dir);
  if (files.length === 0 && !fs.existsSync(dir)) return null;
  return files.reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0);
}

function formatBytes(bytes) {
  if (bytes === null) return "n/a";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function collectViteAssets(distDir) {
  const assetsDir = path.join(distDir, "assets");
  if (!fs.existsSync(assetsDir)) return [];
  return fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js") || name.endsWith(".css"))
    .map((name) => {
      const filePath = path.join(assetsDir, name);
      const stat = fs.statSync(filePath);
      return { name, raw: stat.size, gzip: gzipSync(fs.readFileSync(filePath)).length };
    })
    .sort((a, b) => b.raw - a.raw);
}

if (!skipBuild) {
  execSync("npm run build", { cwd: root, stdio: "inherit" });
  execSync("npm run build:web", { cwd: root, stdio: "inherit" });
}

const nextStandalone = path.join(root, ".next/standalone");
const viteDist = path.join(root, "apps/web/dist");
const nextStandaloneBytes = dirSizeBytes(nextStandalone);
const viteDistBytes = dirSizeBytes(viteDist);
const viteAssets = collectViteAssets(viteDist);
const viteJsGzip = viteAssets.filter((a) => a.name.endsWith(".js")).reduce((s, a) => s + a.gzip, 0);
const forbiddenStandalone = ["target", "crates", "apps"].filter((rel) =>
  fs.existsSync(path.join(nextStandalone, rel)),
);

console.log("\n=== Bundle comparison ===\n");
console.log(`Next .next/standalone: ${formatBytes(nextStandaloneBytes)}`);
console.log(`Vite apps/web/dist: ${formatBytes(viteDistBytes)}`);
console.log(`Vite JS gzip sum: ${formatBytes(viteJsGzip)}`);

if (forbiddenStandalone.length > 0) {
  console.error(`Forbidden standalone paths: ${forbiddenStandalone.join(", ")}`);
  process.exit(1);
}

const budgetResults = [
  { name: "nextStandaloneBytes", actual: nextStandaloneBytes, limit: BUDGETS.nextStandaloneBytes },
  { name: "viteDistBytes", actual: viteDistBytes, limit: BUDGETS.viteDistBytes },
  { name: "viteJsGzipTotal", actual: viteJsGzip, limit: BUDGETS.viteJsGzipTotal },
].map((e) => ({ ...e, ok: e.actual !== null && e.actual <= e.limit }));

if (ciMode) {
  console.log("\n=== Bundle budgets ===\n");
  let failed = false;
  for (const b of budgetResults) {
    console.log(`  [${b.ok ? "OK" : "FAIL"}] ${b.name}: ${formatBytes(b.actual)} / ${formatBytes(b.limit)}`);
    if (!b.ok) failed = true;
  }
  if (failed) process.exit(1);
}

const report = { generatedAt: new Date().toISOString(), nextStandaloneBytes, viteDistBytes, viteJsGzipTotal: viteJsGzip, viteAssets, budgets: BUDGETS, budgetResults, forbiddenStandalone };
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, "bundle-report.json"), `${JSON.stringify(report, null, 2)}\n`);
