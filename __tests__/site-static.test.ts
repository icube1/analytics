import fs from "node:fs";
import path from "node:path";

const siteRoot = path.join(__dirname, "..", "apps", "site");
const srcRoot = path.join(siteRoot, "src");

function readAllFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) readAllFiles(full, acc);
    else if (/\.(astro|css|mjs|ts)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

describe("astro marketing site source", () => {
  const files = readAllFiles(srcRoot);
  const corpus = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");

  it("documents Russian resilience themes", () => {
    expect(corpus).toMatch(/финансовой устойчивости/i);
    expect(corpus).toMatch(/многослойн/i);
    expect(corpus).toMatch(/долг/i);
    expect(corpus).toMatch(/приватност/i);
    expect(corpus).toMatch(/app\.gala-soft\.ru/);
  });

  it("avoids trackers and named securities", () => {
    expect(corpus).not.toMatch(/googletagmanager|google-analytics|facebook\.net|yandex\.metrika/i);
    expect(corpus).not.toMatch(/\b(SBER|GAZP|LKOH|AAPL|VTI|VOO)\b/);
  });

  it("includes demo disclaimer without guaranteed outcomes", () => {
    expect(corpus).toMatch(/не гарантирует/i);
    expect(corpus).toMatch(/не является/i);
    expect(corpus).toMatch(/рекомендац/i);
  });

  it("has robots and sitemap integration configured", () => {
    const robots = fs.readFileSync(path.join(siteRoot, "public", "robots.txt"), "utf8");
    const astroConfig = fs.readFileSync(path.join(siteRoot, "astro.config.mjs"), "utf8");
    expect(robots).toMatch(/sitemap-index\.xml/i);
    expect(astroConfig).toMatch(/@astrojs\/sitemap/);
  });
});
