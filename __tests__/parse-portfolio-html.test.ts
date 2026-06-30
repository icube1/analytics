import fs from "node:fs";
import path from "node:path";
import { parsePortfolioHtml } from "@/lib/parse-portfolio-html";

describe("parsePortfolioHtml", () => {
  it("parses securities from sample report", () => {
    const htmlPath = path.join(process.cwd(), "public", "portfolio.html");
    const html = fs.readFileSync(htmlPath, "utf-8");
    const report = parsePortfolioHtml(html);

    const rosneft = report.securities.find((s) => s.name.includes("Роснефть"));
    expect(rosneft).toBeDefined();
    expect(rosneft!.quantityEnd).toBe(136);
    expect(rosneft!.valueChange).toBeCloseTo(1289.75, 2);
  });

  it("merges duplicate ISIN rows from different venues", () => {
    const htmlPath = path.join(process.cwd(), "data", "broker-report.html");
    if (!fs.existsSync(htmlPath)) return;

    const html = fs.readFileSync(htmlPath, "utf-8");
    const report = parsePortfolioHtml(html);
    const sber = report.securities.filter((s) => s.isin === "RU0009029540");

    expect(sber).toHaveLength(1);
    expect(report.trades.filter((t) => t.ticker === "SBER")).toHaveLength(2);
    expect(new Set(report.trades.map((t) => t.id)).size).toBe(report.trades.length);
  });
});
