import fs from "node:fs";
import path from "node:path";

export const SANITIZED_INVESTOR = "Тестовый Инвестор";
export const SANITIZED_CONTRACT = "SANITIZED-CONTRACT";
export const SANITIZED_ACCOUNT = "SANITIZED-ACCOUNT";
export const SANITIZED_EMAIL = "[SANITIZED-EMAIL]";
export const SANITIZED_PHONE = "[SANITIZED-PHONE]";
export const SANITIZED_ADDRESS = "SANITIZED-ADDRESS";

const DEFAULT_FIXTURES = [
  "public/portfolio.html",
  "__tests__/fixtures/sber-t1-report.html",
];

/**
 * Removes customer identity and embedded media while leaving report tables,
 * dates, securities, and monetary values unchanged.
 *
 * Sanitizing tracked files does not rewrite git history; older commits may
 * still contain the original PII. See docs/broker-fixture-sanitization.md.
 */
export function sanitizeBrokerFixture(input: string): string {
  let html = input;

  // Signature rows can contain both a label and a large embedded scan.
  html = html.replace(
    /<tr\b[^>]*>(?:(?!<\/tr>)[\s\S])*(?:подпись|signature)(?:(?!<\/tr>)[\s\S])*<\/tr>/giu,
    "",
  );

  // Embedded report logos, signatures, and decorative image payloads.
  html = html
    .replace(/<img\b[^>]*>/giu, "")
    .replace(/\sbackground\s*=\s*(["'])data:image\/[\s\S]*?\1/giu, "")
    .replace(/url\(\s*(["']?)data:image\/[\s\S]*?\1\s*\)/giu, "none")
    .replace(/data:image\/[^"'<>)]*/giu, "");

  // Document metadata is not needed by the portfolio parser.
  html = html
    .replace(/<!--[\s\S]*?-->/gu, "")
    .replace(/<meta\b[^>]*>/giu, "")
    .replace(/(<title\b[^>]*>)[\s\S]*?(<\/title>)/giu, "$1Sanitized broker fixture$2");

  // Customer name and brokerage contract in the report header.
  html = html.replace(
    /(Инвестор:\s*)([\s\S]*?)(\s*<br\b[^>]*>\s*Договор(?:\s|&nbsp;)+)([^\s<]+)/giu,
    `$1${SANITIZED_INVESTOR}$3${SANITIZED_CONTRACT}`,
  );
  html = html.replace(
    /(Договор(?:\s|&nbsp;)+)(?!SANITIZED-CONTRACT\b)([^\s<]+)/giu,
    `$1${SANITIZED_CONTRACT}`,
  );

  // Explicitly labelled account identifiers, without touching ISINs or deal IDs.
  html = html.replace(
    /((?:Номер|№)\s+(?:(?:брокерского|торгового|лицевого)\s+)?сч[её]та\s*(?::|№|-)?\s*)([^<\s]+)/giu,
    `$1${SANITIZED_ACCOUNT}`,
  );
  html = html.replace(
    /((?:Торговый|Брокерский|Лицевой)\s+сч[её]т\s*(?:№|:)\s*)([^<\s]+)/giu,
    `$1${SANITIZED_ACCOUNT}`,
  );

  // Contact fields may occur in reports from other broker templates.
  html = html
    .replace(
      /[\p{L}\d.!#$%&'*+/=?^_`{|}~-]+@[\p{L}\d.-]+\.[\p{L}]{2,}/giu,
      SANITIZED_EMAIL,
    )
    .replace(
      /(?<!\d)(?:\+?7|8)[ ()-]*\d{3}[ ()-]*\d{3}[ -]*\d{2}[ -]*\d{2}(?!\d)/gu,
      SANITIZED_PHONE,
    )
    .replace(
      /((?:Адрес|Address)\s*:\s*)[^<\r\n]+/giu,
      `$1${SANITIZED_ADDRESS}`,
    );

  return html;
}

export function sanitizeFixtureFile(filePath: string): void {
  const original = fs.readFileSync(filePath, "utf8");
  const sanitized = sanitizeBrokerFixture(original);
  fs.writeFileSync(filePath, sanitized, "utf8");
}

function runCli(): void {
  const fixturePaths =
    process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_FIXTURES;

  for (const fixturePath of fixturePaths) {
    sanitizeFixtureFile(path.resolve(fixturePath));
  }
}

const entryPoint = process.argv[1];
if (entryPoint && path.basename(entryPoint) === "sanitize-broker-fixture.ts") {
  runCli();
}
