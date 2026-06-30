import fs from "node:fs";
import path from "node:path";

/** Корень Next.js-проекта (папка с package.json). */
export function getProjectRoot(): string {
  return process.cwd();
}

export function getDataDir(): string {
  return path.join(getProjectRoot(), "data");
}

export function getStatementsDir(): string {
  return path.join(getProjectRoot(), "statements");
}

export function ensureDataDir(): string {
  const dir = getDataDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function ensureStatementsDir(): string {
  const dir = getStatementsDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
