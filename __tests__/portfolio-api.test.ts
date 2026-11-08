import fs from "node:fs";
import path from "node:path";

/**
 * Временный data-каталог: подменяем project-paths, чтобы API писал
 * в sandbox, а не в data/ проекта.
 */
jest.mock("@/lib/project-paths", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require("node:path") as typeof import("node:path");
  const root = () => String(process.env.ANALYTICS_TEST_PROJECT_ROOT);
  return {
    getProjectRoot: () => root(),
    getDataDir: () => nodePath.join(root(), "data"),
    getStatementsDir: () => nodePath.join(root(), "statements"),
    ensureDataDir: () => {
      const dir = nodePath.join(root(), "data");
      nodeFs.mkdirSync(dir, { recursive: true });
      return dir;
    },
    ensureStatementsDir: () => {
      const dir = nodePath.join(root(), "statements");
      nodeFs.mkdirSync(dir, { recursive: true });
      return dir;
    },
  };
});

import {
  DELETE as deletePortfolio,
  GET as getPortfolio,
  PUT as putPortfolio,
} from "@/app/api/portfolio/route";
import {
  GET as listPortfolioRoute,
  POST as createPortfolioRoute,
} from "@/app/api/portfolio/list/route";
import { POST as importBrokerRoute } from "@/app/api/portfolio/broker/route";
import { buildManualCsvTemplate } from "@/lib/broker-adapters";

const ROOT = path.join(
  process.env.TMPDIR ?? process.env.TEMP ?? ".",
  `analytics-portfolio-api-${process.pid}`,
);
const DATA = path.join(ROOT, "data");
const PORTFOLIOS = path.join(DATA, "portfolios");

function portfolioFile(id: string): string {
  return path.join(PORTFOLIOS, `${id}.json`);
}

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>;
}

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

type Json = Record<string, unknown>;

async function payload(response: Response): Promise<Json> {
  return (await response.json()) as Json;
}

describe("portfolio API: мультипортфельный режим", () => {
  beforeAll(() => {
    process.env.ANALYTICS_TEST_PROJECT_ROOT = ROOT;
    // без настроенных креденшелов requireServerAuth пропускает в test-окружении
    delete process.env.ANALYTICS_AUTH_USER;
    delete process.env.ANALYTICS_AUTH_PASSWORD;
    fs.rmSync(ROOT, { recursive: true, force: true });
    fs.mkdirSync(PORTFOLIOS, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(ROOT, { recursive: true, force: true });
    delete process.env.ANALYTICS_TEST_PROJECT_ROOT;
  });

  it("GET без параметра отдаёт default", async () => {
    const response = await getPortfolio(
      new Request("http://localhost/api/portfolio"),
    );
    expect(response.status).toBe(200);
    const doc = await payload(response);
    expect(doc.id).toBe("default");
    expect(doc.dataPath).toBe("data/portfolio.json");
  });

  it("создаёт портфель, отдаёт его в списке и по id", async () => {
    const created = await createPortfolioRoute(
      jsonRequest("http://localhost/api/portfolio/list", "POST", {
        id: "alpha",
        title: "Альфа",
        groupId: "g1",
      }),
    );
    expect(created.status).toBe(201);
    const createdDoc = await payload(created);
    expect(createdDoc.id).toBe("alpha");
    expect(createdDoc.title).toBe("Альфа");
    expect(createdDoc.groupId).toBe("g1");

    // запись легла в data/portfolios/alpha.json
    expect(fs.existsSync(portfolioFile("alpha"))).toBe(true);
    expect(readJson(portfolioFile("alpha")).title).toBe("Альфа");

    const list = await listPortfolioRoute(
      new Request("http://localhost/api/portfolio/list"),
    );
    expect(list.status).toBe(200);
    const { portfolios } = await payload(list);
    const alpha = (portfolios as Json[]).find((item) => item.id === "alpha");
    expect(alpha).toMatchObject({ id: "alpha", title: "Альфа", groupId: "g1" });

    const read = await getPortfolio(
      new Request("http://localhost/api/portfolio?portfolio=alpha"),
    );
    expect(read.status).toBe(200);
    const readDoc = await payload(read);
    expect(readDoc.id).toBe("alpha");
    expect(readDoc.title).toBe("Альфа");
    expect(readDoc.dataPath).toContain("alpha.json");
  });

  it("создание без id генерирует идентификатор и пишет файл", async () => {
    const created = await createPortfolioRoute(
      jsonRequest("http://localhost/api/portfolio/list", "POST", {}),
    );
    expect(created.status).toBe(201);
    const doc = await payload(created);
    const id = String(doc.id);
    expect(id).toMatch(/^portfolio-/);
    expect(fs.existsSync(portfolioFile(id))).toBe(true);
    fs.rmSync(portfolioFile(id), { force: true });
  });

  it("PUT с ?portfolio=a не меняет портфель b", async () => {
    for (const id of ["a", "b"]) {
      const response = await createPortfolioRoute(
        jsonRequest("http://localhost/api/portfolio/list", "POST", {
          id,
          title: id.toUpperCase(),
        }),
      );
      expect(response.status).toBe(201);
    }

    const beforeB = readJson(portfolioFile("b"));

    const updated = await putPortfolio(
      jsonRequest("http://localhost/api/portfolio?portfolio=a", "PUT", {
        title: "A обновлён",
        // тело пытается подменить id — query должен победить
        id: "b",
      }),
    );
    expect(updated.status).toBe(200);
    const updatedDoc = await payload(updated);
    expect(updatedDoc.id).toBe("a");
    expect(updatedDoc.title).toBe("A обновлён");

    expect(readJson(portfolioFile("a")).title).toBe("A обновлён");
    expect(readJson(portfolioFile("b"))).toEqual(beforeB);
    expect(readJson(portfolioFile("b")).title).toBe("B");
  });

  it("PUT без параметра пишет в default", async () => {
    const response = await putPortfolio(
      jsonRequest("http://localhost/api/portfolio", "PUT", {
        title: "Основной",
      }),
    );
    expect(response.status).toBe(200);
    expect((await payload(response)).id).toBe("default");
    expect(readJson(portfolioFile("default")).title).toBe("Основной");
  });

  it("POST с существующим id отвечает 409 и не перезаписывает", async () => {
    await createPortfolioRoute(
      jsonRequest("http://localhost/api/portfolio/list", "POST", {
        id: "dup",
        title: "Первый",
      }),
    );
    const before = readJson(portfolioFile("dup"));

    const again = await createPortfolioRoute(
      jsonRequest("http://localhost/api/portfolio/list", "POST", {
        id: "dup",
        title: "Второй",
      }),
    );
    expect(again.status).toBe(409);
    expect((await payload(again)).id).toBe("dup");
    expect(readJson(portfolioFile("dup"))).toEqual(before);
  });

  it("DELETE удаляет портфель и отдаёт 404 на повтор", async () => {
    await createPortfolioRoute(
      jsonRequest("http://localhost/api/portfolio/list", "POST", {
        id: "temp-del",
        title: "Удалить",
      }),
    );
    expect(fs.existsSync(portfolioFile("temp-del"))).toBe(true);

    const removed = await deletePortfolio(
      new Request("http://localhost/api/portfolio?portfolio=temp-del", {
        method: "DELETE",
      }),
    );
    expect(removed.status).toBe(200);
    expect(await payload(removed)).toMatchObject({ ok: true, id: "temp-del" });
    expect(fs.existsSync(portfolioFile("temp-del"))).toBe(false);

    const again = await deletePortfolio(
      new Request("http://localhost/api/portfolio?portfolio=temp-del", {
        method: "DELETE",
      }),
    );
    expect(again.status).toBe(404);
  });

  it("санитизирует id из query — файл не выходит за пределы каталога", async () => {
    const response = await getPortfolio(
      new Request("http://localhost/api/portfolio?portfolio=../evil"),
    );
    expect(response.status).toBe(200);
    const doc = await payload(response);
    expect(doc.id).toBe("___evil");
    expect(String(doc.dataPath).startsWith(PORTFOLIOS)).toBe(true);
    expect(fs.existsSync(path.join(DATA, "evil.json"))).toBe(false);
  });

  it("импорт отчёта идёт в указанный портфель и не трогает соседние", async () => {
    const html = buildManualCsvTemplate();
    const defaultBefore = readJson(portfolioFile("default"));

    const post = (id: string) =>
      importBrokerRoute(
        jsonRequest(
          `http://localhost/api/portfolio/broker?portfolio=${id}`,
          "POST",
          { html, fileName: "manual.csv" },
        ),
      );

    const importedA = await post("brk-a");
    expect(importedA.status).toBe(200);
    const bodyA = await payload(importedA);
    expect(bodyA.portfolioId).toBe("brk-a");
    expect(String(bodyA.savedTo)).toContain("brk-a");

    const aDoc = readJson(portfolioFile("brk-a"));
    expect(Array.isArray(aDoc.brokerAccounts)).toBe(true);
    expect((aDoc.brokerAccounts as unknown[]).length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(DATA, "broker-report.brk-a.html"))).toBe(true);

    const beforeA = readJson(portfolioFile("brk-a"));

    const importedB = await post("brk-b");
    expect(importedB.status).toBe(200);
    const bDoc = readJson(portfolioFile("brk-b"));
    expect((bDoc.brokerAccounts as unknown[]).length).toBeGreaterThan(0);

    // второй импорт не перезаписал первый и не тронул default
    expect(readJson(portfolioFile("brk-a"))).toEqual(beforeA);
    expect(readJson(portfolioFile("default"))).toEqual(defaultBefore);
  });
});
