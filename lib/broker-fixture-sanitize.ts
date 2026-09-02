export const SANITIZED_INVESTOR = "Тестовый Инвестор";
export const SANITIZED_CONTRACT = "SANITIZED-CONTRACT";
export const SANITIZED_ACCOUNT = "SANITIZED-ACCOUNT";
export const SANITIZED_EMAIL = "[SANITIZED-EMAIL]";
export const SANITIZED_PHONE = "[SANITIZED-PHONE]";
export const SANITIZED_ADDRESS = "SANITIZED-ADDRESS";

/**
 * Removes customer identity and embedded media while leaving report tables,
 * dates, securities, and monetary values unchanged.
 */
export function sanitizeBrokerFixture(input: string): string {
  let html = input;

  html = html.replace(
    /<tr\b[^>]*>(?:(?!<\/tr>)[\s\S])*(?:подпись|signature)(?:(?!<\/tr>)[\s\S])*<\/tr>/giu,
    "",
  );

  html = html
    .replace(/<img\b[^>]*>/giu, "")
    .replace(/\sbackground\s*=\s*(["'])data:image\/[\s\S]*?\1/giu, "")
    .replace(/url\(\s*(["']?)data:image\/[\s\S]*?\1\s*\)/giu, "none")
    .replace(/data:image\/[^"'<>)]*/giu, "");

  html = html
    .replace(/<!--[\s\S]*?-->/gu, "")
    .replace(/<meta\b[^>]*>/giu, "")
    .replace(/(<title\b[^>]*>)[\s\S]*?(<\/title>)/giu, "$1Sanitized broker fixture$2");

  html = html.replace(
    /(Инвестор:\s*)([\s\S]*?)(\s*<br\b[^>]*>\s*Договор(?:\s|&nbsp;)+)([^\s<]+)/giu,
    `$1${SANITIZED_INVESTOR}$3${SANITIZED_CONTRACT}`,
  );
  html = html.replace(
    /(Договор(?:\s|&nbsp;)+)(?!SANITIZED-CONTRACT\b)([^\s<]+)/giu,
    `$1${SANITIZED_CONTRACT}`,
  );

  html = html.replace(
    /((?:Номер|№)\s+(?:(?:брокерского|торгового|лицевого)\s+)?сч[её]та\s*(?::|№|-)?\s*)([^<\s]+)/giu,
    `$1${SANITIZED_ACCOUNT}`,
  );
  html = html.replace(
    /((?:Торговый|Брокерский|Лицевой)\s+сч[её]т\s*(?:№|:)\s*)([^<\s]+)/giu,
    `$1${SANITIZED_ACCOUNT}`,
  );

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
