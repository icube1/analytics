import fs from "node:fs";
import path from "node:path";
import { importBrokerReport, parseSberPortfolioHtml } from "@/lib/broker-adapters";
import { detectAccountKind } from "@/lib/broker-adapters/adapters/sber-html";
import { parseHtmlDocument } from "@/lib/broker-adapters/html";

const fixtureDir = path.join(process.cwd(), "__tests__", "fixtures");
const iis3Fixture = path.join(fixtureDir, "sber-iis3", "report.html");
const brokerFixture = path.join(fixtureDir, "sber-broker-empty", "report.html");

function readFixture(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function importFixture(filePath: string) {
  return importBrokerReport({
    content: readFixture(filePath),
    fileName: path.basename(filePath),
  });
}

describe("Sber HTML: ИИС-3 отчёт (S259RFF)", () => {
  const result = importFixture(iis3Fixture);

  it("извлекает код договора вместо служебного слова", () => {
    expect(result.ok).toBe(true);
    expect(result.report?.contract).toBe("TEST-IIS3");
  });

  it("определяет тип счёта как ИИС-3", () => {
    expect(result.report?.accountKind).toBe("iis3");
    expect(result.coverage?.accountKind).toBe(true);
  });

  it("читает зачисления на ИИС из официальной таблицы", () => {
    const deposits = result.report?.deposits ?? [];
    expect(deposits).toHaveLength(2);
    expect(deposits.reduce((sum, item) => sum + item.amount, 0)).toBe(400000);
    expect(deposits[0]).toMatchObject({
      year: "2026",
      date: "02.10.2026",
      amount: 20000,
      basis: "Зачисление д/с на ИИС",
      limit: "Ограничений нет",
    });
    // год и лимит у второй строки пустые в отчёте — наследуются от группы
    expect(deposits[1]).toMatchObject({
      year: "2026",
      amount: 380000,
      limit: "Ограничений нет",
    });
    expect(result.coverage?.depositCount).toBe(2);
  });

  it("сохраняет 5 позиций и сходится с оценкой активов", () => {
    const report = result.report;
    expect(report?.securities).toHaveLength(5);
    expect(report?.securitiesEnd).toBeCloseTo(426430.9, 2);
    expect(report?.cashEnd).toBeCloseTo(1059.93, 2);
    expect(report?.assetsEnd).toBeCloseTo(427490.83, 2);
    expect(result.reconciliation?.withinTolerance).toBe(true);
    expect(result.reconciliation?.assetsDelta).toBeCloseTo(0, 2);
  });

  it("извлекает номинал и НКД по бумагам", () => {
    const rosneft = result.report?.securities.find((item) =>
      item.name.includes("Роснефть"),
    );
    expect(rosneft?.nominal).toBeCloseTo(0.01, 5);
    expect(rosneft?.nkdStart).toBe(0);
    expect(rosneft?.nkdEnd).toBe(0);
  });

  it("не содержит ПДн в фикстуре", () => {
    const html = readFixture(iis3Fixture);
    expect(html).not.toMatch(/<img\b|data:image|;base64,/iu);
    expect(html).not.toMatch(/<meta\b/iu);
    expect(html).not.toMatch(/подпись/iu);
    expect(result.report?.investor).toBe("Тестовый Инвестор");
  });
});

describe("Sber HTML: пустой брокерский счёт с налоговым блоком (4259RFF)", () => {
  const result = importFixture(brokerFixture);

  it("распознаёт отчёт, а не падает с RECOGNITION_FAILED", () => {
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.report).not.toBeNull();
    expect(result.warnings.map((w) => w.code)).toContain("EMPTY_PORTFOLIO");
  });

  it("определяет тип счёта как брокерский и код договора", () => {
    expect(result.report?.contract).toBe("TEST-BRK");
    expect(result.report?.accountKind).toBe("broker");
  });

  it("портфель пустой: нет бумаг, сделок и ДДС", () => {
    expect(result.report?.securities).toHaveLength(0);
    expect(result.report?.trades).toHaveLength(0);
    expect(result.report?.cashFlows).toHaveLength(0);
    expect(result.report?.assetsEnd).toBe(0);
    expect(result.report?.deposits).toBeUndefined();
  });

  it("парсит раздел I и итоговый финансовый результат", () => {
    const tax = result.report?.tax;
    expect(tax).toBeDefined();
    expect(tax?.year).toBe("2026");

    expect(tax?.rows.map((row) => row.code)).toEqual([
      "1535",
      "1530",
      "2740",
      "1537",
    ]);
    expect(tax?.rows[1]).toMatchObject({
      code: "1530",
      income: 639891.15,
      taxable: -75203.11,
      expenseCode: "201",
      expense: 715094.26,
    });

    expect(tax?.income).toBeCloseTo(639891.15, 2);
    expect(tax?.expense).toBeCloseTo(715094.26, 2);
    expect(tax?.realized).toBeCloseTo(-75203.11, 2);

    expect(tax?.rateBands.map((band) => band.rate)).toEqual([13, 15, 35]);
    expect(tax?.rateBands.every((band) => band.base === 0 && band.tax === 0)).toBe(
      true,
    );
    expect(tax?.taxDue).toBe(0);
    expect(tax?.lossCarry).toBeCloseTo(76996.21, 2);
  });

  it("не содержит ФИО клиента в налоговых таблицах", () => {
    const html = readFixture(brokerFixture);
    expect(html).not.toMatch(/ГАЛИМЗЯНОВ|РИФАТОВИЧ|Годовых/iu);
    expect(html).not.toMatch(/<img\b|data:image|;base64,|<meta\b/iu);
    expect(result.report?.investor).toBe("Тестовый Инвестор");
  });
});

describe("Sber HTML: определение типа счёта и кода договора", () => {
  const kindOf = (body: string) => detectAccountKind(parseHtmlDocument(body));

  it("различает поколения ИИС по маркеру в тексте", () => {
    expect(
      kindOf(
        "<p>Договор на ведение индивидуального инвестиционного счета ИИС-3</p>",
      ),
    ).toBe("iis3");
    expect(
      kindOf(
        "<p>Договор на ведение индивидуального инвестиционного счета ИИС-1</p>",
      ),
    ).toBe("iis1");
    expect(
      kindOf("<p>Договор на ведение индивидуального инвестиционного счета</p>"),
    ).toBe("iis2");
    expect(kindOf("<p>Договор на ведение брокерского счета</p>")).toBe("broker");
  });

  it("ловит метку ИИС3 из таблицы зачислений", () => {
    expect(kindOf("<table><tr><td>ИИС3</td></tr></table>")).toBe("iis3");
  });

  it("берёт код из формулировки «Договор на ведение … счета X»", () => {
    const html = [
      "<html><body>",
      "<h3>Отчет брокера за период с 09.09.2026 по 12.10.2026, дата создания 13.10.2026</h3>",
      "<p>Инвестор: Тестовый Инвестор<br>",
      "Договор на ведение индивидуального инвестиционного счета S259RFF от 09.09.2026</br></p>",
      "</body></html>",
    ].join("");
    const parsed = parseSberPortfolioHtml(html);

    expect(parsed.ledger.contract).toBe("S259RFF");
    // без маркера «ИИС3» в тексте считаем формат ИИС-2 (по умолчанию для ИИС)
    expect(parsed.ledger.accountKind).toBe("iis2");
  });

  it("не путает код договора с датой", () => {
    const html = [
      "<html><body>",
      "<h3>Отчет брокера за период с 09.09.2026 по 12.10.2026, дата создания 13.10.2026</h3>",
      "<p>Инвестор: Тестовый Инвестор<br>Договор 4259RFF от 09.09.2026</br></p>",
      "</body></html>",
    ].join("");
    const parsed = parseSberPortfolioHtml(html);

    expect(parsed.ledger.contract).toBe("4259RFF");
    expect(parsed.ledger.accountKind).toBe("broker");
  });
});

describe("Sber HTML: сверка учитывает НКД", () => {
  it("сравнивает стоимость ЦБ с НКД из строки рейтинга", () => {
    const html = [
      "<html><body>",
      "<h3>Отчет брокера за период с 01.06.2026 по 30.06.2026, дата создания 01.07.2026</h3>",
      "<p>Инвестор: Тестовый Инвестор<br>Договор 1000AAA от 01.06.2026</br></p>",
      '<table class="RatingAssets"><tr class="table-header"><td>Торговая площадка</td></tr>',
      "<tr><td>Основной рынок</td><td>0</td><td>0</td><td>0</td>",
      "<td>1050</td><td>0</td><td>1050</td><td></td><td></td><td>1050</td></tr></table>",
      "<p>Портфель Ценных Бумаг</p>",
      "<table><tr><td>Облигация</td><td>RU000A0J2Q06</td><td>RUB</td>",
      "<td>10</td><td>1000</td><td>100</td><td>1000</td><td>40</td>",
      "<td>10</td><td>1000</td><td>100</td><td>1000</td><td>50</td>",
      "<td>0</td><td>0</td><td>0</td><td>0</td><td>10</td></tr></table>",
      "</body></html>",
    ].join("");

    const parsed = parseSberPortfolioHtml(html);
    const position = parsed.ledger.securities[0];

    expect(position.valueEnd).toBe(1000);
    expect(position.nominal).toBe(1000);
    expect(position.nkdStart).toBe(40);
    expect(position.nkdEnd).toBe(50);
    expect(parsed.reconciliation.securitiesEndComputed).toBeCloseTo(1050, 2);
    expect(parsed.reconciliation.withinTolerance).toBe(true);
    expect(parsed.warnings.map((warning) => warning.code)).not.toContain(
      "RECONCILIATION_MISMATCH",
    );
  });
});
