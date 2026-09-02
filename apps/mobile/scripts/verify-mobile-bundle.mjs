import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(scriptDir, "..");
const webDistDir = path.join(mobileRoot, "../web/dist");
const indexPath = path.join(webDistDir, "index.html");
const marker = "analytics-mobile-runtime-config";

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function walkDirectorySize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += walkDirectorySize(fullPath);
    } else if (entry.isFile()) {
      total += statSync(fullPath).size;
    }
  }
  return total;
}

const checks = [];

try {
  const indexHtml = readFileSync(indexPath, "utf8");
  checks.push(["web dist index.html", true]);
  checks.push(["mobile runtime injection", indexHtml.includes(marker)]);
  checks.push(
    [
      "mobile config object",
      indexHtml.includes("window.__ANALYTICS_MOBILE_CONFIG__"),
    ],
  );
  checks.push([
    "wasm bundle",
    statSync(
      path.join(webDistDir, "wasm/finance-wasm/finance_wasm_bg.wasm"),
    ).isFile(),
  ]);
} catch (error) {
  checks.push(["web dist index.html", false]);
  console.error(error instanceof Error ? error.message : error);
}

const distSize = walkDirectorySize(webDistDir);
const report = {
  generatedAt: new Date().toISOString(),
  webDistBytes: distSize,
  webDistHuman: formatBytes(distSize),
  checks: Object.fromEntries(checks),
};

const failed = checks.filter(([, ok]) => !ok);
if (failed.length > 0) {
  console.error(
    "Mobile bundle verification failed:",
    failed.map(([name]) => name),
  );
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
