import fs from "node:fs";
import path from "node:path";
import { parsePortfolioHtml } from "@/lib/parse-portfolio-html";
import {
  SANITIZED_ACCOUNT,
  SANITIZED_ADDRESS,
  SANITIZED_CONTRACT,
  SANITIZED_EMAIL,
  SANITIZED_INVESTOR,
  SANITIZED_PHONE,
  sanitizeBrokerFixture,
} from "@/scripts/sanitize-broker-fixture";

const fixturePaths = [
  path.join(process.cwd(), "public", "portfolio.html"),
  path.join(
    process.cwd(),
    "__tests__",
    "fixtures",
    "sber-t1-report.html",
  ),
];

const emailPattern =
  /[\p{L}\d.!#$%&'*+/=?^_`{|}~-]+@[\p{L}\d.-]+\.[\p{L}]{2,}/iu;
const phonePattern =
  /(?<!\d)(?:\+?7|8)[ ()-]*\d{3}[ ()-]*\d{3}[ -]*\d{2}[ -]*\d{2}(?!\d)/u;

describe("broker fixture privacy", () => {
  it.each(fixturePaths)("contains no customer PII or embedded signatures: %s", (fixturePath) => {
    const html = fs.readFileSync(fixturePath, "utf8");
    const investor = html.match(/Инвестор:\s*([^<\r\n]+)/u)?.[1].trim();
    const contract = html.match(/Договор\s+([^\s<]+)/u)?.[1];

    expect(investor).toBe(SANITIZED_INVESTOR);
    expect(contract).toBe(SANITIZED_CONTRACT);
    expect(html).not.toMatch(emailPattern);
    expect(html).not.toMatch(phonePattern);
    expect(html).not.toMatch(
      /(?:Адрес|Address)\s*:\s*(?!SANITIZED-ADDRESS(?:\s|<))/iu,
    );
    expect(html).not.toMatch(
      /(?:Номер|№)\s+(?:(?:брокерского|торгового|лицевого)\s+)?сч[её]та\s*(?::|№|-)?\s*(?!SANITIZED-ACCOUNT(?:\s|<))\S+/iu,
    );
    expect(html).not.toMatch(/(?:подпись|signature)/iu);
    expect(html).not.toMatch(/(?:<img\b|data:image\/|;base64,)/iu);
    expect(html).not.toMatch(/<meta\b/iu);
    expect(sanitizeBrokerFixture(html)).toBe(html);
  });

  it("sanitizes supported PII fields deterministically", () => {
    const source = [
      "<html><head><meta name=\"author\" content=\"private\"><title>Private</title></head>",
      "<body><p>Инвестор: Тестов Тест Тестович<br>Договор PRIVATE-1</p>",
      "<p>Номер брокерского счета: PRIVATE-2</p>",
      "<p>Email: private@example.com Телефон: +7 999 123-45-67</p>",
      "<p>Адрес: Private street</p>",
      "<table><tr><td>Подпись клиента</td><td><img src=\"data:image/png;base64,PRIVATE\"></td></tr></table>",
      "</body></html>",
    ].join("");

    const sanitized = sanitizeBrokerFixture(source);

    expect(sanitized).toContain(SANITIZED_INVESTOR);
    expect(sanitized).toContain(SANITIZED_CONTRACT);
    expect(sanitized).toContain(SANITIZED_ACCOUNT);
    expect(sanitized).toContain(SANITIZED_EMAIL);
    expect(sanitized).toContain(SANITIZED_PHONE);
    expect(sanitized).toContain(SANITIZED_ADDRESS);
    expect(sanitized).not.toContain("PRIVATE");
    expect(sanitizeBrokerFixture(sanitized)).toBe(sanitized);
  });

  it("preserves parser-visible arithmetic in both sanitized reports", () => {
    const publicReport = parsePortfolioHtml(
      fs.readFileSync(fixturePaths[0], "utf8"),
    );
    const sberReport = parsePortfolioHtml(
      fs.readFileSync(fixturePaths[1], "utf8"),
    );

    const rosneft = publicReport.securities.find((security) =>
      security.name.includes("Роснефть"),
    );
    const gold = sberReport.securities.find((security) =>
      security.name.includes("золото"),
    );

    expect(publicReport.investor).toBe(SANITIZED_INVESTOR);
    expect(publicReport.contract).toBe(SANITIZED_CONTRACT);
    expect(rosneft?.quantityEnd).toBe(136);
    expect(rosneft?.valueChange).toBeCloseTo(1289.75, 2);
    expect(sberReport.investor).toBe(SANITIZED_INVESTOR);
    expect(sberReport.contract).toBe(SANITIZED_CONTRACT);
    expect(gold?.quantityEnd).toBe(667);
    expect(gold?.quantityPlanned).toBe(2087);
    expect(gold?.plannedCredits).toBe(1420);
    expect(sberReport.cash.find((item) => item.currency === "RUB")?.endPlanned)
      .toBeCloseTo(30.93, 1);
  });
});
