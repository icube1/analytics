import fs from "node:fs";
import path from "node:path";
import {
  buildManualCsvTemplate,
  detectBrokerAdapters,
  importBrokerReport,
  parseBrokerNumber,
  parseSberPortfolioHtml,
} from "@/lib/broker-adapters";
import { parsePortfolioHtml } from "@/lib/parse-portfolio-html";
import { SANITIZED_CONTRACT, SANITIZED_INVESTOR } from "@/scripts/sanitize-broker-fixture";

describe("broker adapter platform", () => {
  const publicFixture = path.join(process.cwd(), "public", "portfolio.html");
  const sberFixture = path.join(
    process.cwd(),
    "__tests__",
    "fixtures",
    "sber-t1-report.html",
  );

  it("detects Sber HTML with high confidence", () => {
    const html = fs.readFileSync(publicFixture, "utf8");
    const detection = detectBrokerAdapters({
      content: html,
      fileName: "portfolio.html",
    });

    expect(detection[0]?.adapterId).toBe("sber-html-v1");
    expect(detection[0]?.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("imports sanitized Sber fixtures with reconciliation metadata", () => {
    const html = fs.readFileSync(sberFixture, "utf8");
    const result = importBrokerReport({
      content: html,
      fileName: "sber-t1-report.html",
    });

    expect(result.ok).toBe(true);
    expect(result.provenance.adapterId).toBe("sber-html-v1");
    expect(result.coverage?.securities).toBe(true);
    expect(result.report?.investor).toBe(SANITIZED_INVESTOR);
    expect(result.report?.contract).toBe(SANITIZED_CONTRACT);
    expect(result.reconciliation?.assetsEndReported).toBeGreaterThan(0);
  });

  it("preserves legacy parsePortfolioHtml output for public fixture", () => {
    const html = fs.readFileSync(publicFixture, "utf8");
    const report = parsePortfolioHtml(html);
    const rosneft = report.securities.find((s) => s.name.includes("Роснефть"));

    expect(rosneft?.quantityEnd).toBe(136);
    expect(rosneft?.valueChange).toBeCloseTo(1289.75, 2);
  });

  it("does not coerce malformed required numbers to zero", () => {
    const malformed = parseBrokerNumber("12abc");
    expect(malformed.ok).toBe(false);

    const html = [
      "<html><body>",
      '<table class="RatingAssets"><tr><td>Основной рынок</td>',
      "<td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td><td></td><td></td><td>9</td></tr></table>",
      "<p>Портфель Ценных Бумаг</p><table><tr>",
      "<td>Bad Corp</td><td>RU0000000099</td><td>RUB</td>",
      "<td>1</td><td></td><td>1</td><td>1</td><td></td><td>bad-qty</td><td></td>",
      "<td>100</td><td>100</td><td></td><td></td><td>0</td><td></td><td></td><td></td>",
      "</tr></table></body></html>",
    ].join("");

    const parsed = parseSberPortfolioHtml(html);
    expect(parsed.warnings.some((w) => w.code === "INVALID_NUMBER")).toBe(true);
    expect(parsed.warnings.some((w) => w.code === "SKIPPED_ROW")).toBe(true);
    expect(parsed.ledger.securities).toHaveLength(0);
  });

  it("imports manual CSV template adapter", () => {
    const csv = buildManualCsvTemplate();
    const result = importBrokerReport({
      content: csv,
      fileName: "manual.csv",
    });

    expect(result.ok).toBe(true);
    expect(result.provenance.adapterId).toBe("manual-csv-v1");
    expect(result.report?.securities).toHaveLength(1);
    expect(result.report?.cash).toHaveLength(1);
    expect(result.report?.investor).toBe("Manual Investor");
  });

  it("returns deterministic error when no adapter matches", () => {
    const result = importBrokerReport({
      content: "plain text without broker markers",
      fileName: "notes.txt",
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe("NO_ADAPTER_MATCH");
    expect(result.report).toBeNull();
  });

  it.each([
    ["tbank-xlsx", "tbank-report.csv", "tbank.csv"],
    ["vtb-xls", "vtb-report.csv", "vtb.csv"],
    ["bcs-xls", "bcs-report.csv", "bcs.csv"],
    ["alfa-xml", "alfa-report.xml", "alfa.xml"],
    ["finam-xml", "finam-report.xml", "finam.xml"],
  ] as const)("imports sanitized %s fixture", (adapterId, fileName, uploadName) => {
    const content = fs.readFileSync(
      path.join(process.cwd(), "__tests__", "fixtures", fileName),
      "utf8",
    );
    const result = importBrokerReport({ content, fileName: uploadName });

    expect(result.ok).toBe(true);
    expect(result.provenance.adapterId).toBe(adapterId);
    expect(result.report?.investor).toBe(SANITIZED_INVESTOR);
    expect(result.report?.contract).toBe(SANITIZED_CONTRACT);
    expect(result.coverage?.securities).toBe(true);
    expect(result.reconciliation?.withinTolerance).toBe(true);
  });
});
